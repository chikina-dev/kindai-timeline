/**
 * OpenDataLoader ベースの PDF 時間割パーサー
 *
 * Usage:
 *   npx tsx scripts/parse-pdf-opendataloader.ts --file data/pdf/【前期】R8情報学部時間割.pdf
 *   npx tsx scripts/parse-pdf-opendataloader.ts --file data/pdf/【前期】R8情報学部時間割.pdf --out data/courses-2026-前期-odl.json
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, parse, resolve } from "path";

import { convert } from "@opendataloader/pdf";

interface RawCourse {
  day: string | null;
  period: number | number[] | null;
  category: string;
  grade: number | number[] | null;
  course: string;
  class: string | null;
  classroom: string | null;
  credits: number;
  instructor: string | string[] | null;
  note: string | null;
  features: string | null;
}

interface OpenDataLoaderCell {
  kids?: unknown[];
  content?: string;
  ["row number"]?: number;
  ["column number"]?: number;
  ["row span"]?: number;
  ["column span"]?: number;
}

interface OpenDataLoaderRow {
  cells?: OpenDataLoaderCell[];
  ["row number"]?: number;
}

interface OpenDataLoaderTable {
  type?: string;
  rows?: OpenDataLoaderRow[];
  ["number of rows"]?: number;
  ["number of columns"]?: number;
}

const DAYS = ["月", "火", "水", "木", "金", "土", "日"];

function parsePeriod(s: string): number | number[] | null {
  const trimmed = s.trim();
  if (!trimmed || trimmed === "-" || trimmed === "－") return null;

  const rangeMatch = trimmed.match(/^(\d+)[~～](\d+)$/);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1], 10);
    const end = parseInt(rangeMatch[2], 10);
    const range = Array.from({ length: end - start + 1 }, (_, index) => start + index);
    return range.length === 1 ? range[0] : range;
  }

  const number = parseInt(trimmed, 10);
  return Number.isNaN(number) ? null : number;
}

function parseGrade(s: string): number | number[] | null {
  return parsePeriod(s);
}

function parseInstructors(s: string): string | string[] | null {
  const trimmed = s.replace(/\n/g, " ").replace(/\s+/g, " ").replace(/\s*[－-]\s*$/, "").trim();
  if (!trimmed || trimmed === "-") return null;

  const parts = trimmed
    .split(/[，,、]/)
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.length === 0 ? null : parts.length === 1 ? parts[0] : parts;
}

function parseNote(s: string): string | null {
  const trimmed = s.replace(/\n/g, " ").trim();
  return !trimmed || trimmed === "-" ? null : trimmed;
}

function extractFeatures(note: string | null): string | null {
  if (!note) return null;
  return note.includes("メディア授業") ? "メディア授業" : null;
}

function parseClassName(s: string): string | null {
  const trimmed = s.trim();
  if (!trimmed || trimmed === "-" || trimmed === "－") return null;
  return trimmed.replace(/^[（(](.+)[）)]$/, "$1") || null;
}

function normalizeMediaLabel(s: string): string {
  return s.replace(/メ\s*デ\s*ィ\s*ア\s*授\s*業/g, "メディア授業");
}

function normalizeCompactText(s: string): string {
  return normalizeDomainText(
    normalizeMediaLabel(s)
    .replace(/\s+/g, " ")
    .trim()
  );
}

function normalizeDomainText(s: string): string {
  return s
    .replace(/生涯スポ\s+ーツ/g, "生涯スポーツ")
    .replace(/プ\s+ログラミング/g, "プログラミング")
    .replace(/イン\s+グリッシュ/g, "イングリッシュ")
    .replace(/担\s+当教員/g, "担当教員")
    .replace(/が\s+あります/g, "があります")
    .replace(/くだ\s+さい/g, "ください")
    .replace(/そち\s+ら/g, "そちら")
    .replace(/ご\s+確認/g, "ご確認")
    .replace(/履修登録は\s+【/g, "履修登録は【")
    .replace(/幸\s+裕/g, "幸裕")
    .replace(/洋\s+始/g, "洋始")
    .replace(/千\s+里/g, "千里")
    .replace(/昌\s+宏/g, "昌宏");
}

function normalizeCourseText(s: string): string {
  return normalizeMediaLabel(s)
    .replace(/\s+/g, "")
    .replace(/^[－-]+/, "")
    .replace(/^\d+【メディア授業】/, "")
    .replace(/^【メディア授業】/, "")
    .trim();
}

function looksLikeClassroomValue(s: string): boolean {
  const normalized = normalizeCompactText(s)
    .replace(/[【】]/g, "")
    .replace(/】\s*【/g, ", ");

  if (!normalized || normalized === "-" || normalized === "－") return false;
  if (/^(オンデマンド|学部独自オンデマンド|KICSオンデマンド)$/.test(normalized)) return false;
  if (/担当教員より案内|履修登録|ご確認ください|オンデマンド/.test(normalized)) return false;

  return /(記念会館|[A-Z]-\d{3}(?:他)?(?:\s*,\s*[A-Z]-\d{3}(?:他)?)*|[A-Z]-\d{3}\s*,\s*\d{3}|\d-\d{3}|【[A-Z]-\d{3}】)/.test(normalized);
}

function normalizeClassroomValue(s: string): string {
  return normalizeCompactText(s)
    .replace(/】\s*【/g, ", ")
    .replace(/[【】]/g, "")
    .replace(/,\s*(\d{3}(?:他)?)/g, ", E-$1")
    .replace(/\s*,\s*/g, ", ")
    .trim();
}

function parseClassroom(s: string): string | null {
  const trimmed = normalizeClassroomValue(s);
  if (!trimmed || trimmed === "-" || trimmed === "－") return null;
  return trimmed;
}

function mergeNotes(...values: Array<string | null>): string | null {
  const parts = values
    .map((value) => value ? normalizeCompactText(value) : null)
    .filter((value): value is string => Boolean(value) && value !== "-" && value !== "－");

  if (parts.length === 0) return null;

  return Array.from(new Set(parts)).join(" ").trim() || null;
}

function reorderPriorityNote(note: string | null): string | null {
  if (!note) return null;

  const patterns = [/履修登録は[^。]*?(?:行うこと|ください|確認してください)/, /担当教員より案内があります。?\s*そちらをご確認ください。?/];
  const extracted: string[] = [];
  let rest = note;

  for (const pattern of patterns) {
    const match = rest.match(pattern);
    if (!match) continue;
    extracted.push(normalizeCompactText(match[0]));
    rest = normalizeCompactText(rest.replace(match[0], " "));
  }

  return mergeNotes(...extracted, rest);
}

function rebalanceCourseFields(course: RawCourse): void {
  const normalizedClassroom = course.classroom ? normalizeCompactText(course.classroom) : null;
  const normalizedNote = course.note ? normalizeCompactText(course.note) : null;

  if (normalizedNote && !normalizedClassroom && looksLikeClassroomValue(normalizedNote)) {
    course.classroom = parseClassroom(normalizedNote);
    course.note = null;
  } else if (normalizedClassroom && !looksLikeClassroomValue(normalizedClassroom)) {
    course.note = mergeNotes(normalizedClassroom, normalizedNote);
    course.classroom = null;
  } else {
    course.classroom = normalizedClassroom ? parseClassroom(normalizedClassroom) : null;
    course.note = normalizedNote;
  }

  course.note = reorderPriorityNote(course.note);
}

function splitCourseAndEmbeddedNote(course: string): {
  course: string;
  embeddedNote: string | null;
} {
  const noteStartPatterns = ["履修登録は", "※情報処理実習", "※23年以前", "※25年以前"];

  for (const pattern of noteStartPatterns) {
    const noteIndex = course.indexOf(pattern);
    if (noteIndex > 0) {
      return {
        course: course.slice(0, noteIndex).trim(),
        embeddedNote: course.slice(noteIndex).trim(),
      };
    }
  }

  return { course, embeddedNote: null };
}

function isDay(s: string): boolean {
  return DAYS.includes(s.trim());
}

function isCategory(s: string): boolean {
  return ["共通教養", "専門", "外国語"].includes(s.trim());
}

function compareCourseOrder(left: RawCourse, right: RawCourse): number {
  const leftDay = left.day ? DAYS.indexOf(left.day) : Number.MAX_SAFE_INTEGER;
  const rightDay = right.day ? DAYS.indexOf(right.day) : Number.MAX_SAFE_INTEGER;
  if (leftDay !== rightDay) return leftDay - rightDay;

  const leftPeriod = Array.isArray(left.period) ? (left.period[0] ?? Number.MAX_SAFE_INTEGER) : (left.period ?? Number.MAX_SAFE_INTEGER);
  const rightPeriod = Array.isArray(right.period) ? (right.period[0] ?? Number.MAX_SAFE_INTEGER) : (right.period ?? Number.MAX_SAFE_INTEGER);
  if (leftPeriod !== rightPeriod) return leftPeriod - rightPeriod;

  return 0;
}

function inferCreditsFromCourse(course: RawCourse): number {
  const normalizedCourse = normalizeCourseText(course.course);

  if (
    course.category === "外国語" ||
    /アカデミックイングリッシュ|英語総合|中国語総合|韓国語総合|オーラルイングリッシュ|TOEIC/.test(normalizedCourse)
  ) {
    return 1;
  }

  if (/社会情報学実習/.test(normalizedCourse)) {
    return 1;
  }

  if (/情報学応用ゼミナール/.test(normalizedCourse)) {
    return 2;
  }

  if (/キャリアデザイン/.test(normalizedCourse)) {
    return 3;
  }

  return 0;
}

function inferFeatureForNullDayCourse(course: RawCourse): string {
  const normalizedCourse = normalizeCourseText(course.course);
  const normalizedNote = normalizeCompactText(course.note ?? "");

  if (course.features) {
    return course.features;
  }

  if (normalizedNote.includes("KICSオンデマンド")) {
    return "KICSオンデマンド";
  }

  if (/社会情報学実習[３3４4]/.test(normalizedCourse)) {
    return "専門科目オンデマンド";
  }

  return "KICSオンデマンド";
}

function collectNodeText(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) {
    return node.map((child) => collectNodeText(child)).filter(Boolean).join("\n");
  }

  if (typeof node !== "object") return "";

  const record = node as Record<string, unknown>;
  if (typeof record.content === "string") {
    return record.content;
  }

  if (Array.isArray(record.kids)) {
    return record.kids.map((child) => collectNodeText(child)).filter(Boolean).join("\n");
  }

  return "";
}

function normalizeCellText(s: string): string {
  return s
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function collectTables(node: unknown, tables: OpenDataLoaderTable[]): void {
  if (node == null) return;

  if (Array.isArray(node)) {
    for (const child of node) {
      collectTables(child, tables);
    }
    return;
  }

  if (typeof node !== "object") return;

  const record = node as Record<string, unknown>;
  if (record.type === "table") {
    tables.push(record as OpenDataLoaderTable);
  }

  for (const value of Object.values(record)) {
    collectTables(value, tables);
  }
}

function tableToDenseRows(table: OpenDataLoaderTable): string[][] {
  const totalRows = table["number of rows"] ?? table.rows?.length ?? 0;
  const totalColumns = table["number of columns"] ?? 0;
  const grid = Array.from({ length: totalRows }, () => Array.from({ length: totalColumns }, () => ""));

  for (const row of table.rows ?? []) {
    const rowIndex = (row["row number"] ?? 1) - 1;

    for (const cell of row.cells ?? []) {
      const columnIndex = (cell["column number"] ?? 1) - 1;
      const rowSpan = cell["row span"] ?? 1;
      const columnSpan = cell["column span"] ?? 1;
      const text = normalizeCellText(collectNodeText(cell.kids ?? cell.content ?? ""));

      for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
        const targetRow = rowIndex + rowOffset;
        if (!grid[targetRow]) {
          grid[targetRow] = Array.from({ length: totalColumns }, () => "");
        }

        for (let columnOffset = 0; columnOffset < columnSpan; columnOffset += 1) {
          const targetColumn = columnIndex + columnOffset;
          if (!grid[targetRow][targetColumn]) {
            grid[targetRow][targetColumn] = text;
          }
        }
      }
    }
  }

  return grid;
}

function isCourseHeaderRow(row: string[]): boolean {
  const header = row.map((cell) => normalizeCompactText(cell));

  return (
    header[0] === "曜日" &&
    header[1] === "時限" &&
    header[2] === "科目分類（大）" &&
    header[3] === "学年" &&
    header[4] === "科目名"
  );
}

function isCourseLikeTable(rows: string[][]): boolean {
  const firstRow = rows[0] ?? [];
  if (firstRow.length === 0) return false;

  if (isCourseHeaderRow(firstRow)) {
    return true;
  }

  if (firstRow.length >= 10) {
    return isCategory(firstRow[2] ?? "") && Boolean(normalizeCellText(firstRow[4] ?? ""));
  }

  if (firstRow.length === 9) {
    return isCategory(firstRow[1] ?? "") && Boolean(normalizeCellText(firstRow[3] ?? ""));
  }

  if (firstRow.length === 8) {
    return isCategory(firstRow[1] ?? "") && Boolean(normalizeCellText(firstRow[3] ?? ""));
  }

  return false;
}

function normalizeExtractedTableRows(rows: string[][]): string[][] {
  const bodyRows = isCourseHeaderRow(rows[0] ?? []) ? rows.slice(1) : rows;

  return bodyRows.map((row) => {
    if (row.length >= 10) {
      return row.slice(0, 10);
    }

    if (row.length === 9) {
      return [row[0] ?? "", "", row[1] ?? "", row[2] ?? "", row[3] ?? "", row[4] ?? "", row[5] ?? "", row[6] ?? "", row[7] ?? "", row[8] ?? ""];
    }

    if (row.length === 8) {
      return [row[0] ?? "", "", row[1] ?? "", row[2] ?? "", row[3] ?? "", row[4] ?? "", row[5] ?? "", row[6] ?? "", "", row[7] ?? ""];
    }

    return row;
  });
}

function normalizeRow(row: string[]): string[] {
  return Array.from({ length: 10 }, (_, index) => normalizeCellText(row[index] ?? ""));
}

function dedupeCourses(courses: RawCourse[]): RawCourse[] {
  const seen = new Set<string>();
  const deduped: RawCourse[] = [];

  for (const course of courses) {
    const key = JSON.stringify(course);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(course);
  }

  return deduped;
}

async function extractTableRowsFromPdf(filePath: string): Promise<string[][]> {
  const tempDir = mkdtempSync(join(tmpdir(), "kindai-opendataloader-"));

  try {
    await convert([filePath], {
      outputDir: tempDir,
      format: "json",
      quiet: true,
      readingOrder: "xycut",
      tableMethod: "cluster",
    });

    const jsonPath = join(tempDir, `${parse(filePath).name}.json`);
    const document = JSON.parse(readFileSync(jsonPath, "utf-8")) as Record<string, unknown>;
    const tables: OpenDataLoaderTable[] = [];
    collectTables(document, tables);

    return tables
      .map((table) => tableToDenseRows(table))
      .filter((rows) => rows.length > 0 && isCourseLikeTable(rows))
      .flatMap((rows) => normalizeExtractedTableRows(rows));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function parsePdf(filePath: string): Promise<RawCourse[]> {
  const rawRows = await extractTableRowsFromPdf(filePath);
  const courses: RawCourse[] = [];

  for (const rawRow of rawRows) {
    const row = normalizeRow(rawRow);
    const [day, periodStr, category, gradeStr, courseNameRaw, classStr, creditsStr, instructorStr, classroomStr, noteStr] = row;

    if (!isCategory(category)) continue;
    if (!courseNameRaw || courseNameRaw === "-" || courseNameRaw === "－") continue;

    const note = parseNote(noteStr);
    const parsedCredits = parseInt(creditsStr.trim(), 10);

    const course: RawCourse = {
      day: isDay(day) ? day : null,
      period: parsePeriod(periodStr),
      category: category.trim(),
      grade: parseGrade(gradeStr),
      course: courseNameRaw.trim(),
      class: parseClassName(classStr),
      classroom: parseClassroom(classroomStr),
      credits: Number.isNaN(parsedCredits) ? 0 : parsedCredits,
      instructor: parseInstructors(instructorStr),
      note: note?.replace(/【メディア授業】\s*/, "").trim() || null,
      features: extractFeatures(note),
    };

    courses.push(course);
  }

  for (const course of courses) {
    const originalCourse = course.course;
    const inferredCredit = originalCourse.match(/^\s*(\d+)\s*【メディア授業】/)?.[1];
    const normalizedCourse = normalizeCourseText(originalCourse);
    const splitResult = splitCourseAndEmbeddedNote(normalizedCourse);

    course.course = splitResult.course;
    course.class = course.class ? normalizeCompactText(course.class) : null;
    course.classroom = course.classroom ? normalizeCompactText(course.classroom) : null;
    course.note = course.note ? normalizeCompactText(course.note) : null;
    course.features = course.features ? normalizeCompactText(course.features) : null;

    if (splitResult.embeddedNote) {
      course.note = course.note
        ? `${splitResult.embeddedNote} ${course.note}`
        : splitResult.embeddedNote;
    }

    if (Array.isArray(course.instructor)) {
      course.instructor = course.instructor.map((instructor) => normalizeCompactText(instructor));
    } else if (course.instructor) {
      course.instructor = normalizeCompactText(course.instructor);
    }

    if (course.note) {
      course.note = course.note.replace(/^【メディア授業】\s*/, "").trim() || null;
      if (course.note && course.note.endsWith("-")) {
        course.note = course.note.replace(/\s*-\s*$/, "").trim() || null;
      }
    }

    rebalanceCourseFields(course);

    if ((course.features == null || course.features === "") && ((typeof course.note === "string" && course.note.includes("メディア授業")) || originalCourse.includes("メディア授業"))) {
      course.features = "メディア授業";
    }

    if (course.credits === 0 && inferredCredit) {
      course.credits = parseInt(inferredCredit, 10);
    }
  }

  const creditsByName = new Map<string, number>();
  for (const course of courses) {
    if (course.credits > 0) {
      const previous = creditsByName.get(course.course) ?? 0;
      creditsByName.set(course.course, Math.max(previous, course.credits));
    }
  }

  for (const course of courses) {
    if (course.credits === 0) {
      course.credits = creditsByName.get(course.course) ?? 0;
    }
    if (course.credits === 0) {
      course.credits = inferCreditsFromCourse(course);
    }
  }

  for (const course of courses) {
    if (course.period === null) {
      course.day = null;
    }
    if (course.day === null) {
      course.features = inferFeatureForNullDayCourse(course);
    }
  }

  return dedupeCourses(courses)
    .map((course, index) => ({ course, index }))
    .sort((left, right) => {
      const order = compareCourseOrder(left.course, right.course);
      return order !== 0 ? order : left.index - right.index;
    })
    .map(({ course }) => course);
}

async function main() {
  const args = process.argv.slice(2);
  let filePath = "";
  let outPath = "";

  if (args.includes("--help") || args.includes("-h")) {
    console.log("Usage: tsx scripts/parse-pdf-opendataloader.ts --file <pdf-path> [--out <json-path>]");
    return;
  }

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--file" && args[index + 1]) {
      filePath = resolve(args[index + 1]);
      index += 1;
    } else if (args[index] === "--out" && args[index + 1]) {
      outPath = resolve(args[index + 1]);
      index += 1;
    }
  }

  if (!filePath) {
    console.error("Usage: tsx scripts/parse-pdf-opendataloader.ts --file <pdf-path> [--out <json-path>]");
    process.exit(1);
  }

  if (!outPath) {
    outPath = filePath.replace(/\.pdf$/i, ".json");
  }

  console.log(`Parsing with OpenDataLoader: ${filePath}`);
  const courses = await parsePdf(filePath);
  console.log(`Extracted ${courses.length} course entries`);

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(courses, null, 2), "utf-8");
  console.log(`Written to: ${outPath}`);
}

main().catch((error) => {
  console.error("Parse failed:", error);
  process.exit(1);
});