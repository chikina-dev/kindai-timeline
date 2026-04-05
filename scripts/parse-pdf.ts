/**
 * PDF時間割パーサー
 * data/pdf/ 内のPDFから科目データを抽出し、data/ にJSONを出力する
 *
 * Usage:
 *   npx tsx scripts/parse-pdf.ts --file data/pdf/R8情報学部時間割案（前期）.pdf
 *   npx tsx scripts/parse-pdf.ts --file data/pdf/R8情報学部時間割案（前期）.pdf --out data/courses-2026-前期.json
 *   npx tsx scripts/parse-pdf.ts --file data/pdf/R8情報学部時間割案（後期）.pdf --out data/courses-2026-後期.json
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

// pdf-parse v2
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PDFParse } = require("pdf-parse");

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------
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

type Row = string[];
type Table = Row[];

interface ParsedPageTables {
  num: number;
  tables: Table[];
}

interface PdfPageLike {
  getTextContent(params?: {
    includeMarkedContent?: boolean;
    disableNormalization?: boolean;
  }): Promise<{ items: unknown[] }>;
  cleanup(): void;
}

interface PdfDocumentLike {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPageLike>;
}

interface TableDataLike {
  toArray(): Table;
}

interface LineStoreLike {
  normalize(): void;
  getTableData(): TableDataLike[];
}

interface PdfParseLike {
  doc?: PdfDocumentLike;
  load(): Promise<void>;
  destroy(): Promise<void>;
  getPageTables(page: PdfPageLike): Promise<LineStoreLike>;
  fillPageTables(page: PdfPageLike, pageTables: TableDataLike[]): Promise<void>;
}

interface PositionedText {
  str: string;
  x: number;
  y: number;
  width: number;
}

interface ColumnLayout {
  starts: number[];
  hasClassroomColumn: boolean;
}

interface FallbackExtractionResult {
  rows: Row[];
  layout: ColumnLayout;
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

/** "1～3" → [1,2,3], "3~4" → [3,4], "2" → 2, "" → null */
function parsePeriod(s: string): number | number[] | null {
  s = s.trim();
  if (!s || s === "-" || s === "－") return null;
  // "3~4" or "1～3"
  const rangeMatch = s.match(/^(\d+)[~～](\d+)$/);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1]);
    const end = parseInt(rangeMatch[2]);
    const arr: number[] = [];
    for (let i = start; i <= end; i++) arr.push(i);
    return arr.length === 1 ? arr[0] : arr;
  }
  const n = parseInt(s);
  return isNaN(n) ? null : n;
}

/** "1～3" → [1,2,3], "2～3" → [2,3], "3" → 3, "1" → 1 */
function parseGrade(s: string): number | number[] | null {
  s = s.trim();
  if (!s || s === "-" || s === "－") return null;
  const rangeMatch = s.match(/^(\d+)[~～](\d+)$/);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1]);
    const end = parseInt(rangeMatch[2]);
    const arr: number[] = [];
    for (let i = start; i <= end; i++) arr.push(i);
    return arr.length === 1 ? arr[0] : arr;
  }
  const n = parseInt(s);
  return isNaN(n) ? null : n;
}

/** Trim and normalize instructor text, split by commas */
function parseInstructors(s: string): string | string[] | null {
  s = s.replace(/\n/g, " ").replace(/\s+/g, " ").replace(/\s*[－-]\s*$/, "").trim();
  if (!s || s === "-") return null;
  // Split by Japanese/full-width comma or regular comma
  const parts = s
    .split(/[，,、]/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length === 0 ? null : parts.length === 1 ? parts[0] : parts;
}

/** Clean note text: remove 【メディア授業】 prefix, trim */
function parseNote(s: string): string | null {
  s = s.replace(/\n/g, " ").trim();
  if (!s || s === "-") return null;
  return s;
}

/** Extract features from note/備考 (e.g., メディア授業) */
function extractFeatures(note: string | null): string | null {
  if (!note) return null;
  if (note.includes("メディア授業")) return "メディア授業";
  return null;
}

/** Clean class name: strip parentheses, trim */
function parseClassName(s: string): string | null {
  s = s.trim();
  if (!s || s === "-") return null;
  // Remove outer parentheses: （A）→ A, (A-1) → A-1
  s = s.replace(/^[（(](.+)[）)]$/, "$1");
  return s || null;
}

function parseClassroom(s: string): string | null {
  s = normalizeCompactText(s);
  if (!s || s === "-" || s === "－") return null;
  s = s.replace(/^【(.+)】$/, "$1");
  return s;
}

function splitGradeAndCourseCell(s: string): { grade: string; course: string } | null {
  const trimmed = normalizeCompactText(s);
  const match = trimmed.match(/^(\d+(?:[~～]\d+)?)\s+(.+)$/);
  if (!match) return null;
  return {
    grade: match[1],
    course: match[2].trim(),
  };
}

function reconstructSparseBaseRow(row: Row, currentDay: string, currentPeriod: string): Row | null {
  if (
    row.length !== 10 ||
    row[0] ||
    row[1] ||
    !isCategory(row[2]) ||
    row[4] ||
    row[5] ||
    !row[6]
  ) {
    return null;
  }

  const split = splitGradeAndCourseCell(row[3] || "");
  if (!split) return null;

  return [currentDay, currentPeriod, row[2], split.grade, split.course, "", row[6], row[7] || "", row[8] || "", row[9] || ""];
}

function looksLikePlaceholderSubclassRow(row: Row): boolean {
  return (
    row.length === 10 &&
    !row[0] &&
    !row[1] &&
    !row[2] &&
    !row[3] &&
    !row[4] &&
    Boolean(row[5]) &&
    !row[6] &&
    Boolean(row[7]) &&
    Boolean(row[8])
  );
}

function toPlaceholderSubclassRow(row: Row): Row {
  return [row[5] || "", row[6] || "", row[7] || "", row[8] || ""];
}

function normalizeMediaLabel(s: string): string {
  return s.replace(/メ\s*デ\s*ィ\s*ア\s*授\s*業/g, "メディア授業");
}

function normalizeCompactText(s: string): string {
  return normalizeMediaLabel(s)
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCourseText(s: string): string {
  return normalizeMediaLabel(s)
    .replace(/\s+/g, "")
    .replace(/^[－-]+/, "")
    .replace(/^\d+【メディア授業】/, "")
    .replace(/^【メディア授業】/, "")
    .trim();
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

/** Check if a string looks like a period number */
function isPeriodLike(s: string): boolean {
  return /^\d+([~～]\d+)?$/.test(s.trim());
}

/** Check if first col is a known day */
const DAYS = ["月", "火", "水", "木", "金", "土", "日"];
function isDay(s: string): boolean {
  return DAYS.includes(s.trim());
}

/** Check if a row is a sub-class row (3 cols: class, credits-ish, instructor) */
function looksLikeNote(text: string): boolean {
  return /(メディア授業|履修|受講|合同|回のみ|クラス|利用|ガイダンス|不開講|調整|読み替え|オンデマンド|集中講義)/.test(text);
}

/** Check if row looks like a category (共通教養, 専門, 外国語) */
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

// ----------------------------------------------------------------
// Parse a merged text blob like "応用数学 （知能） 2 木村 裕一 -"
// into { course, class, credits, instructor, note }
// Pattern: courseName [（class）| -] credits instructor [note]
// ----------------------------------------------------------------
function parseMergedBlob(text: string): {
  course: string;
  class: string | null;
  classroom: string | null;
  credits: number;
  instructor: string | string[] | null;
  note: string | null;
  features: string | null;
} | null {
  text = text.replace(/\n/g, " ").trim();
  if (!text) return null;

  // Try pattern: "courseName （class） credits instructor [- note]"
  const match = text.match(
    /^(.+?)\s+[（(]([^）)]+)[）)]\s+(\d+)\s+(.+?)(?:\s+-\s*(.*))?$/
  );
  if (match) {
    const noteText = match[5]?.trim() || null;
    return {
      course: match[1].trim(),
      class: match[2].trim(),
      classroom: null,
      credits: parseInt(match[3]),
      instructor: parseInstructors(match[4].replace(/\s*-\s*$/, "").trim()),
      note: noteText && noteText !== "-" ? noteText : null,
      features: noteText?.includes("メディア授業") ? "メディア授業" : null,
    };
  }

  // Try pattern: "courseName - credits instructor [note]" (no class)
  const match2 = text.match(
    /^(.+?)\s+-\s+(\d+)\s+(.+?)(?:\s+([※【].*))?$/
  );
  if (match2) {
    const noteText = match2[4]?.trim() || null;
    return {
      course: match2[1].trim(),
      class: null,
      classroom: null,
      credits: parseInt(match2[2]),
      instructor: parseInstructors(match2[3].trim()),
      note: noteText,
      features: noteText?.includes("メディア授業") ? "メディア授業" : null,
    };
  }

  return null;
}

// ----------------------------------------------------------------
// Parse a multi-line blob like the オーラルイングリッシュ１ merged cell
// Returns multiple course entries
// ----------------------------------------------------------------
function parseMultiLineMergedBlob(
  text: string,
  category: string,
  gradeStr: string,
  day: string,
  period: string
): RawCourse[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 3) return [];

  const courses: RawCourse[] = [];

  // Check if it ends with courseName + credits + note pattern:
  // e.g., [...class/instructor pairs..., "【メディア授業】", "1", "オーラルイングリッシュ１"]
  // or [..., "情報学基礎ゼミナール１"]
  // Read from bottom to find course name, credits, features
  let courseName: string | null = null;
  let credits = 0;
  let features: string | null = null;
  let note: string | null = null;
  let classInstructorLines: string[] = [];

  // Scan from bottom
  const lastLine = lines[lines.length - 1];
  // If last line is a course name (not a class/instructor pattern)
  if (!/^[（(]/.test(lastLine) && !/^\d+$/.test(lastLine)) {
    courseName = lastLine;
    let idx = lines.length - 2;

    // Check if there's a credits line before
    if (idx >= 0 && /^\d+$/.test(lines[idx])) {
      credits = parseInt(lines[idx]);
      idx--;
    }

    // Check for features like 【メディア授業】
    if (idx >= 0 && /【.+】/.test(lines[idx])) {
      note = lines[idx].replace(/【メディア授業】/, "").trim() || null;
      features = lines[idx].includes("メディア授業") ? "メディア授業" : null;
      idx--;
    }

    classInstructorLines = lines.slice(0, idx + 1);
  }

  if (!courseName) return [];

  // Parse class/instructor pairs from remaining lines
  // Pattern: "(A-1) instructor (A-2) instructor ..." on separate lines or same line
  const merged = classInstructorLines.join(" ");
  // Split on class markers: (X-1), （X）, etc.
  const classEntries = merged.split(/(?=[（(])/).filter(Boolean);

  for (const entry of classEntries) {
    const classMatch = entry.match(/^[（(]([^）)]+)[）)]\s*(.*)/);
    if (classMatch) {
      const className = classMatch[1].trim();
      let instructorText = classMatch[2].trim();
      // Remove trailing separators between blocks
      instructorText = instructorText.replace(/\s*-\s*$/, "").trim();

      // Check if there's a credits override in this block (like "(知能) 2\ninstructor...")
      const creditsMatch = instructorText.match(/^(\d+)\s+(.*)/s);
      let blockCredits = credits;
      if (creditsMatch) {
        blockCredits = parseInt(creditsMatch[1]);
        instructorText = creditsMatch[2].trim();
      }

      if (instructorText) {
        courses.push({
          day: isDay(day) ? day : null,
          period: parsePeriod(period),
          category,
          grade: parseGrade(gradeStr),
          course: courseName,
          class: className,
          classroom: null,
          credits: blockCredits || credits,
          instructor: parseInstructors(instructorText),
          note,
          features,
        });
      }
    }
  }

  return courses;
}

// ----------------------------------------------------------------
// Main parsing logic
// Normalize a row to always have 10 columns:
// [day, period, category, grade, course, class, credits, instructor, classroom, note]
// ----------------------------------------------------------------
function normalizeRow(
  row: Row,
  currentDay: string,
  currentPeriod: string
): { normalized: Row; day: string; period: string } | null {
  const len = row.length;

  if (len === 10) {
    const reconstructed = reconstructSparseBaseRow(row, currentDay, currentPeriod);
    if (reconstructed) {
      return { normalized: reconstructed, day: currentDay, period: currentPeriod };
    }

    // Handle merged grade+course in col[3] when period/class may be populated
    // Pattern: [day?, period?, category, "grade course", "", class?, credits, instructor, classroom, note]
    if (isCategory(row[2]) && !row[4] && row[6]) {
      const split = splitGradeAndCourseCell(row[3] || "");
      if (split) {
        console.log(`[DEBUG grade-merge] ${JSON.stringify(row.slice(0,6))} → grade=${split.grade} course=${split.course}`);
        const day = isDay(row[0]) ? row[0] : currentDay;
        const period = isPeriodLike(row[1]) ? row[1] : currentPeriod;
        return {
          normalized: [day, period, row[2], split.grade, split.course, row[5], row[6], row[7] || "", row[8] || "", row[9] || ""],
          day,
          period,
        };
      }
    }

    const day = isDay(row[0]) ? row[0] : currentDay;
    const period = isPeriodLike(row[1]) ? row[1] : currentPeriod;
    return { normalized: row, day, period };
  }

  if (len === 9) {
    if (isDay(row[0]) && isCategory(row[2])) {
      const day = row[0];
      const period = isPeriodLike(row[1]) ? row[1] : currentPeriod;
      return {
        normalized: [row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7], "", row[8]],
        day,
        period,
      };
    }

    if (isCategory(row[1])) {
      const period = isPeriodLike(row[0]) ? row[0] : currentPeriod;
      return {
        normalized: [currentDay, ...row],
        day: currentDay,
        period,
      };
    }

    const day = isDay(row[0]) ? row[0] : currentDay;
    const period = isPeriodLike(row[1]) ? row[1] : currentPeriod;
    return {
      normalized: [day, row[1], row[2], row[3], row[4], row[5], row[6], row[7], "", row[8] ?? ""],
      day,
      period,
    };
  }

  if (len === 8) {
    // Missing 曜日: [時限, 科目分類, 学年, 科目名, コースクラス, 単位数, 担当者, 備考]
    const firstCol = row[0].trim();
    if (isPeriodLike(firstCol)) {
      return {
        normalized: [currentDay, ...row.slice(0, 7), "", row[7]],
        day: currentDay,
        period: firstCol,
      };
    }
    // First col might be "-" or "－" for オンデマンド → period becomes null
    return {
      normalized: [currentDay, ...row.slice(0, 7), "", row[7]],
      day: currentDay,
      period: firstCol,
    };
  }

  if (len === 7) {
    // Missing 曜日 and 時限: [科目分類, 学年, 科目名, コースクラス, 単位数, 担当者, 備考]
    if (isCategory(row[0])) {
      return {
        normalized: [currentDay, currentPeriod, ...row.slice(0, 6), "", row[6]],
        day: currentDay,
        period: currentPeriod,
      };
    }
    return null; // Unknown pattern
  }

  if (len === 6) {
    // Missing 曜日, 時限 and 備考: [科目分類, 学年, 科目名, コースクラス, 単位数, 担当者]
    if (isCategory(row[0])) {
      return {
        normalized: [currentDay, currentPeriod, ...row, "", ""],
        day: currentDay,
        period: currentPeriod,
      };
    }
    return null;
  }

  // len 4: could be sub-row like ["（実世界）", "1", "instructor", "備考"] or broken period row
  // After アセンブリーアワー, rows are: [period, category, grade, "all_merged_text"]
  if (len === 4) {
    if (isPeriodLike(row[0]) && isCategory(row[1])) {
      // This is a broken merged row - return special marker
      return {
        normalized: ["__MERGED__", row[0], row[1], row[2], row[3], "", "", "", "", ""],
        day: currentDay,
        period: row[0],
      };
    }
    // Could be アセンブリーアワー row like ["3","","","アセンブリーアワー"]
    if (isPeriodLike(row[0]) && row[3]?.includes("アセンブリ")) {
      return {
        normalized: ["__SKIP__", row[0], "", "", "", "", "", "", "", ""],
        day: currentDay,
        period: row[0],
      };
    }
    return null;
  }

  return null; // sub-rows (len 1, 3) handled separately
}

// ----------------------------------------------------------------
// Parse tables from PDF
// ----------------------------------------------------------------
function normalizeTextCell(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s+([）)】、，,])/g, "$1")
    .replace(/([（(【])\s+/g, "$1")
    .trim();
}

function toColumnIndex(x: number, boundaries: number[]): number {
  for (let index = 0; index < boundaries.length; index++) {
    if (x < boundaries[index]) return index;
  }
  return boundaries.length;
}

function isContentRow(row: Row): boolean {
  return Boolean(row[2] || row[4] || row[5] || row[7] || row[8] || row[9]);
}

function backfillColumn(rows: Row[], columnIndex: number, value: string) {
  for (let index = rows.length - 1; index >= 0; index--) {
    const row = rows[index];
    if (row.length !== 10) continue;
    if (!isContentRow(row)) continue;
    if (row[columnIndex]) break;
    row[columnIndex] = value;
  }
}

function getDefaultColumnLayout(): ColumnLayout {
  return {
    starts: [165.9, 209.0, 240.3, 296.1, 362.4, 480.8, 595.0, 681.5, 916.0],
    hasClassroomColumn: false,
  };
}

function detectColumnLayout(
  groupedRows: Array<{ y: number; items: PositionedText[] }>,
  fallbackLayout: ColumnLayout = getDefaultColumnLayout()
): ColumnLayout {
  const headerRow = groupedRows.find((groupedRow) => {
    const labels = groupedRow.items.map((item) => item.str);
    return labels.includes("曜日") && labels.includes("時限") && labels.some((label) => label.includes("科目分類"));
  });

  if (!headerRow) {
    return fallbackLayout;
  }

  const sortedItems = [...headerRow.items].sort((left, right) => left.x - right.x);
  const labels = sortedItems.map((item) => item.str);
  const hasClassroomColumn = labels.some((label) => label.includes("教室"));

  return {
    starts: sortedItems.map((item) => item.x),
    hasClassroomColumn,
  };
}

function collapseExtractedRow(row: Row, hasClassroomColumn: boolean): Row {
  if (hasClassroomColumn) {
    const normalized = row.slice(0, 10);
    while (normalized.length < 10) {
      normalized.push("");
    }
    return normalized;
  }

  const normalized = row.slice(0, 9);
  while (normalized.length < 9) {
    normalized.push("");
  }
  const [day, period, category, grade, course, className, credits, instructor, note] = normalized;
  return [day, period, category, grade, course, className, credits, instructor, "", note];
}

function attachSubClassRow(
  baseCourse: RawCourse,
  row: Row,
  courses: RawCourse[]
): RawCourse | null {
  const className = parseClassName(row[0]);
  const instructor = parseInstructors(row[2]);
  const classroom = parseClassroom(row[3] || "");

  if (className && instructor) {
    const subCourse: RawCourse = {
      ...baseCourse,
      class: className,
      classroom: classroom ?? baseCourse.classroom,
      instructor,
      credits:
        row[1].trim() && !isNaN(parseInt(row[1]))
          ? parseInt(row[1])
          : baseCourse.credits,
    };

    courses.push(subCourse);
    return subCourse;
  }

  if (className) {
    const subCourse: RawCourse = {
      ...baseCourse,
      class: className,
      classroom: classroom ?? baseCourse.classroom,
    };

    courses.push(subCourse);
    return subCourse;
  }

  return null;
}

/**
 * Expand a collapsed-head row where col-0 contains
 * "[day] [period] category grade course" and cols 1-5 contain
 * class, credits, instructor, classroom, note (shifted).
 *
 * Returns null if the row doesn't match this pattern.
 */
function expandCollapsedHeadRow(
  row: Row,
  currentDay: string,
  currentPeriod: string
): { row: Row; day: string | null; period: string | null } | null {
  const head = normalizeCompactText(row[0]);
  if (!head) return null;

  // Try to split "[optional day] [optional period] category grade course"
  // Category keywords anchor the parse
  const categoryPattern = /(共通教養|専門|外国語)/;
  const catMatch = head.match(categoryPattern);
  if (!catMatch || catMatch.index === undefined) return null;

  const prefix = head.slice(0, catMatch.index).trim();
  const afterCat = head.slice(catMatch.index + catMatch[0].length).trim();

  // afterCat should start with grade (number) then course name
  const gradeAndCourse = afterCat.match(/^(\d+(?:[~～]\d+)?)\s+(.+)$/);
  if (!gradeAndCourse) return null;

  const category = catMatch[0];
  const grade = gradeAndCourse[1];
  const course = gradeAndCourse[2].trim();

  // Parse optional day/period from prefix
  let day: string | null = null;
  let period: string | null = null;
  if (prefix) {
    const tokens = prefix.split(/\s+/);
    for (const token of tokens) {
      if (isDay(token)) {
        day = token;
      } else if (isPeriodLike(token)) {
        period = token;
      }
    }
  }

  const effectiveDay = day || currentDay;
  const effectivePeriod = period || currentPeriod;

  // Remaining cols: row[1]=unused, row[2]=class, row[3]=credits, row[4]=instructor, row[5]=classroom+note
  const classStr = row[2] || "";
  const creditsStr = row[3] || "";
  const instructorStr = row[4] || "";
  const classroomAndNote = row[5] || "";

  // Split classroom and note from combined field like "3-502 -" or "【E-404】 【メディア授業】 （ペア：月3）" or "- 【メディア授業】"
  let classroom = "";
  let note = "";
  const crMatch = classroomAndNote.match(/(【メディア授業】.*)/);
  if (crMatch && crMatch.index !== undefined) {
    classroom = classroomAndNote.slice(0, crMatch.index).trim();
    note = crMatch[0];
  } else {
    // Try splitting on " -" at end (note separator)
    const dashEnd = classroomAndNote.match(/^(.+?)\s+-\s*$/);
    if (dashEnd) {
      classroom = dashEnd[1].trim();
      note = "-";
    } else {
      classroom = classroomAndNote;
    }
  }

  return {
    row: [effectiveDay, effectivePeriod, category, grade, course, classStr, creditsStr, instructorStr, classroom, note],
    day,
    period,
  };
}

async function extractFallbackRowsFromPage(
  page: PdfPageLike,
  fallbackLayout?: ColumnLayout
): Promise<FallbackExtractionResult> {
  const textContent = await page.getTextContent({
    includeMarkedContent: false,
    disableNormalization: false,
  });

  const items: PositionedText[] = textContent.items
    .filter((item): item is { str: string; transform: number[]; width: number } => {
      return Boolean(
        item &&
          typeof item === "object" &&
          "str" in item &&
          "transform" in item &&
          "width" in item &&
          typeof item.str === "string" &&
          Array.isArray(item.transform) &&
          typeof item.width === "number" &&
          item.str.trim()
      );
    })
    .map((item) => ({
      str: item.str.trim(),
      x: item.transform[4],
      y: item.transform[5],
      width: item.width,
    }))
    .sort((left, right) => {
      if (Math.abs(right.y - left.y) < 2) {
        return left.x - right.x;
      }
      return right.y - left.y;
    });

  const groupedRows: Array<{ y: number; items: PositionedText[] }> = [];

  for (const item of items) {
    const lastRow = groupedRows[groupedRows.length - 1];
    if (!lastRow || Math.abs(lastRow.y - item.y) > 3) {
      groupedRows.push({ y: item.y, items: [item] });
    } else {
      lastRow.items.push(item);
    }
  }

  const layout = detectColumnLayout(groupedRows, fallbackLayout ?? getDefaultColumnLayout());
  const columnStarts = layout.starts;
  const boundaries = columnStarts.slice(1).map((start, index) => (columnStarts[index] + start) / 2);

  // Debug: dump raw positioned text X-positions for kyouyou page
  const hasKyouyouItems = groupedRows.some(r => r.items.some(i => i.str.includes("教養特殊講義")));
  if (hasKyouyouItems) {
    console.log(`[DEBUG xpos] columnStarts=${JSON.stringify(columnStarts)}`);
    console.log(`[DEBUG xpos] boundaries=${JSON.stringify(boundaries.map(b => Math.round(b)))}`);
    for (let ri = 0; ri < groupedRows.length; ri++) {
      const gr = groupedRows[ri];
      const itemSummary = gr.items.map(i => `${i.str.substring(0,12)}@x=${Math.round(i.x)}`).join(" | ");
      // Only dump rows that contain keywords of interest
      const rowText = gr.items.map(i => i.str).join(" ");
      if (/(教養特殊講義|AIプログラミング|生涯スポーツ|オーラルイングリッシュ|（A-1）|（B-1）|（A-4）|（A-5）|機械学習)/.test(rowText) ||
          /^[（\(][AB]-\d[）\)]$/.test(gr.items[0]?.str ?? "")) {
        console.log(`[DEBUG xpos] y=${Math.round(gr.y)} items=[${itemSummary}]`);
      }
    }
  }

  const rows: Row[] = [];
  let currentDay = "";
  let currentPeriod = "";

  for (const groupedRow of groupedRows) {
    const columns: Array<PositionedText[]> = Array.from({ length: columnStarts.length }, () => []);
    for (const item of groupedRow.items) {
      columns[toColumnIndex(item.x, boundaries)].push(item);
    }

    const rawRow = columns.map((columnItems) => {
      const sorted = columnItems.sort((left, right) => left.x - right.x);
      let text = "";
      let lastRight = -Infinity;

      for (const item of sorted) {
        if (text && item.x - lastRight > 6) {
          text += " ";
        }
        text += item.str;
        lastRight = item.x + item.width;
      }

      return normalizeTextCell(text);
    });

    const row = collapseExtractedRow(rawRow, layout.hasClassroomColumn);

    const joined = row.join(" ").replace(/\s+/g, " ").trim();
    if (!joined) continue;
    if (joined.includes("令和8年度時間割")) continue;
    if (joined.startsWith("曜日 時限")) continue;
    if (/^\d+\s*ページ$/.test(joined)) continue;

    if (row[0] && isDay(row[0])) {
      currentDay = row[0];
      backfillColumn(rows, 0, currentDay);
    }

    if (row[1] && isPeriodLike(row[1])) {
      const oldPeriod = currentPeriod;
      currentPeriod = row[1];
      if (oldPeriod !== currentPeriod) {
        console.log(`[DEBUG period-change] ${currentDay} period ${oldPeriod} -> ${currentPeriod} row=${JSON.stringify(row.slice(0,6))}`);
      }
      backfillColumn(rows, 1, currentPeriod);
    }

    if (!row[0] && currentDay) row[0] = currentDay;
    if (!row[1] && currentPeriod) row[1] = currentPeriod;

    // Detect collapsed-head rows where col-0 contains
    // "[day] [period] category grade course" and remaining cols are shifted.
    if (/(教養特殊講義|ライティング２|オーラルイングリッシュ[２４]|情報学応用ゼミ)/.test(JSON.stringify(row))) {
      console.log(`[DEBUG missing-course] row=${JSON.stringify(row)}`);
    }
    if (row[0] && /(共通教養|専門|外国語)/.test(row[0])) {
      console.log(`[DEBUG cat-in-col0] row=${JSON.stringify(row)} guard=${!row[6] && !row[7] && !row[8] && !row[9]}`);
    }
    if (row[0] && !row[6] && !row[7] && !row[8] && !row[9]) {
      const expanded = expandCollapsedHeadRow(row, currentDay, currentPeriod);
      if (expanded) {
        console.log(`[DEBUG collapsed-head] expanded: ${JSON.stringify(row)} → ${JSON.stringify(expanded.row)}`);
        if (expanded.day) {
          currentDay = expanded.day;
        }
        if (expanded.period) {
          currentPeriod = expanded.period;
        }
        rows.push(expanded.row);
        continue;
      }
    }

    if (!row[2] && !row[4] && row[5] && row[7]) {
      rows.push([row[5], "", row[7], row[8] || ""]);
      continue;
    }

    if (!row[2] && !row[4] && !row[5] && row[9]) {
      rows.push([row[9]]);
      continue;
    }

    if (!row[2] && !row[4] && !row[5] && !row[9]) {
      continue;
    }

    rows.push(row);
  }

  // Debug: dump ALL rows from pages containing 教養特殊講義Ｃ
  const hasKyouyouC = rows.some(r => JSON.stringify(r).includes("教養特殊講義Ｃ"));
  if (hasKyouyouC) {
    console.log(`[DEBUG kyouyou-page] === Page has 教養特殊講義Ｃ (${rows.length} rows) ===`);
    for (let i = 0; i < rows.length; i++) {
      console.log(`[DEBUG kyouyou-page] row[${i}] len=${rows[i].length} ${JSON.stringify(rows[i])}`);
    }
  }
  return { rows, layout };
}

async function extractTablesByPage(pdf: PdfParseLike): Promise<ParsedPageTables[]> {
  await pdf.load();

  if (!pdf.doc) {
    throw new Error("PDF document not loaded");
  }

  const pages: ParsedPageTables[] = [];
  let fallbackLayout: ColumnLayout | undefined;

  for (let pageNumber = 1; pageNumber <= pdf.doc.numPages; pageNumber++) {
    const page = await pdf.doc.getPage(pageNumber);
    try {
      const store = await pdf.getPageTables(page);

      store.normalize();

      const tableDataArr = store.getTableData();
      if (tableDataArr.length === 0) {
        const fallbackResult = await extractFallbackRowsFromPage(page, fallbackLayout);
        fallbackLayout = fallbackResult.layout;
        pages.push({
          num: pageNumber,
          tables: [fallbackResult.rows],
        });
        page.cleanup();
        continue;
      }

      await pdf.fillPageTables(page, tableDataArr);

      pages.push({
        num: pageNumber,
        tables: tableDataArr.map((table) => table.toArray()),
      });
    } catch {
      const fallbackResult = await extractFallbackRowsFromPage(page, fallbackLayout);
      fallbackLayout = fallbackResult.layout;
      pages.push({
        num: pageNumber,
        tables: [fallbackResult.rows],
      });
    }

    page.cleanup();
  }

  return pages;
}

async function parsePdf(filePath: string): Promise<RawCourse[]> {
  const buf = readFileSync(filePath);
  const pdf = new PDFParse({ data: buf }) as PdfParseLike;
  const pages = await extractTablesByPage(pdf);

  const courses: RawCourse[] = [];
  let currentDay = "";
  let currentPeriod = "";
  let lastCourse: RawCourse | null = null;
  let currentBaseCourse: RawCourse | null = null;
  let lastPeriodKey = "";
  let pendingSubClassRows: Row[] = [];
  let inMergedSection = false; // true after アセンブリーアワー or similar merged rows

  for (const page of pages) {
    for (const table of page.tables) {
      // Skip tables that are all empty
      if (table.every((r: Row) => r.length === 1 && r[0] === "")) continue;

      for (const row of table as Table) {
        // Skip header row
        if (row[0] === "曜日") continue;

        // Detect start of a new day (9-col or 8-col with day) → reset merged section
        if (row.length >= 8 && isDay(row[0])) {
          inMergedSection = false;
        }

        if (looksLikePlaceholderSubclassRow(row)) {
          const subclassRow = toPlaceholderSubclassRow(row);
          pendingSubClassRows.push(subclassRow);
          continue;
        }

        // Sub-class row: adds a class variant to the last course.
        // In the classroom-aware fallback this can be 4 cols:
        // [class, credits-ish, instructor, classroom]
        // BUT in merged sections, 3-col rows are [category, grade, mergedText]
        if (row.length === 3 || (row.length === 4 && !isPeriodLike(row[0]))) {
          if (inMergedSection && isCategory(row[0])) {
            // This is a merged 3-col row: [category, grade, mergedBlob]
            const blobText = row[2];

            // Check if it's a multi-line blob (contains \n and class markers)
            if (blobText.includes("\n") && /[（(]/.test(blobText)) {
              const parsed = parseMultiLineMergedBlob(
                blobText, row[0], row[1], currentDay, currentPeriod
              );
              for (const c of parsed) {
                courses.push(c);
                lastCourse = c;
              }
            } else {
              // Simple merged blob: "courseName (class) credits instructor note"
              const parsed = parseMergedBlob(blobText);
              if (parsed) {
                const course: RawCourse = {
                  day: isDay(currentDay) ? currentDay : null,
                  period: parsePeriod(currentPeriod),
                  category: row[0].trim(),
                  grade: parseGrade(row[1]),
                  course: parsed.course,
                  class: parsed.class,
                  classroom: parsed.classroom,
                  credits: parsed.credits,
                  instructor: parsed.instructor,
                  note: parsed.note,
                  features: parsed.features,
                };
                courses.push(course);
                lastCourse = course;
              }
            }
            continue;
          }

          pendingSubClassRows.push(row);
          continue;
        }

        // 1-col row: continuation text (instructor names or "(サイバー)")
        if (row.length === 1) {
          const text = row[0].trim();
          if (!text) continue;

          // If it looks like a course/class designation like "(サイバー)"
          if (/^[（(].*[）)]$/.test(text) && lastCourse) {
            const className = parseClassName(text);
            courses.push({
              ...lastCourse,
              class: className,
            });
            continue;
          }

          if (looksLikeNote(text) && lastCourse) {
            lastCourse.note = lastCourse.note ? `${lastCourse.note} ${text}` : text;
            lastCourse.features = extractFeatures(lastCourse.note);
            continue;
          }

          // Otherwise it's continuation instructor text - append to last course
          if (lastCourse) {
            const existingInstructors = Array.isArray(lastCourse.instructor)
              ? lastCourse.instructor
              : lastCourse.instructor
                ? [lastCourse.instructor]
                : [];
            const newInstructors = parseInstructors(text);
            if (newInstructors) {
              const newArr = Array.isArray(newInstructors)
                ? newInstructors
                : [newInstructors];
              lastCourse.instructor = [...existingInstructors, ...newArr];
            }
          }
          continue;
        }

        // Try to normalize to 9 columns
        const result = normalizeRow(row, currentDay, currentPeriod);
        if (!result) continue;

        const { normalized, day, period } = result;

        currentDay = day;
        currentPeriod = period;

        // Handle skip marker (アセンブリーアワー etc.)
        if (normalized[0] === "__SKIP__") {
          inMergedSection = true;
          continue;
        }

        // Handle merged 4-col rows: [__MERGED__, period, category, grade, mergedText, ...]
        if (normalized[0] === "__MERGED__") {
          inMergedSection = true;
          const mergedCategory = normalized[2];
          const mergedGrade = normalized[3];
          const mergedText = normalized[4];

          // Check if it's a multi-line blob
          if (mergedText.includes("\n") && /[（(]/.test(mergedText)) {
            const parsed = parseMultiLineMergedBlob(
              mergedText, mergedCategory, mergedGrade, currentDay, currentPeriod
            );
            for (const c of parsed) {
              courses.push(c);
              lastCourse = c;
            }
          } else {
            const parsed = parseMergedBlob(mergedText);
            if (parsed) {
              const course: RawCourse = {
                day: isDay(currentDay) ? currentDay : null,
                period: parsePeriod(currentPeriod),
                category: mergedCategory,
                grade: parseGrade(mergedGrade),
                course: parsed.course,
                class: parsed.class,
                classroom: parsed.classroom,
                credits: parsed.credits,
                instructor: parsed.instructor,
                note: parsed.note,
                features: parsed.features,
              };
              courses.push(course);
              lastCourse = course;
            }
          }
          continue;
        }

        const [, periodStr, category, gradeStr, courseName, classStr, creditsStr, instructorStr, classroomStr, noteStr] = normalized;
        const creditsAndInstructorMatch = creditsStr.match(/^(\d+)\s+(.+)$/);
        const parsedCreditsText = creditsAndInstructorMatch?.[1] ?? creditsStr;
        const reconstructedInstructorStr = creditsAndInstructorMatch?.[2]
          ? normalizeCompactText(`${creditsAndInstructorMatch[2]} ${instructorStr}`)
          : instructorStr;

        // Skip non-course rows
        if (!courseName || !category) continue;
        if (!isCategory(category)) continue;

        let repairedClassroomStr = classroomStr || "";
        let repairedNoteStr = noteStr || "";

        if (repairedClassroomStr && !repairedClassroomStr.endsWith("】") && repairedNoteStr.startsWith("】")) {
          repairedClassroomStr = `${repairedClassroomStr}】`;
          repairedNoteStr = repairedNoteStr.slice(1).trim();
        }

        const note = parseNote(repairedNoteStr || "");

        const course: RawCourse = {
          day: isDay(currentDay) ? currentDay : null,
          period: parsePeriod(periodStr),
          category,
          grade: parseGrade(gradeStr),
          course: courseName.trim(),
          class: parseClassName(classStr || ""),
          classroom: parseClassroom(repairedClassroomStr || ""),
          credits: parseInt(parsedCreditsText) || 0,
          instructor: parseInstructors(reconstructedInstructorStr || ""),
          note: note?.replace(/【メディア授業】\s*/, "").trim() || null,
          features: extractFeatures(note),
        };

        // Fix: if credits is 0 but there's an empty string field, skip
        if (course.credits === 0 && creditsStr?.trim() === "") {
          // Try to keep the course, credits might be in a sub-row
        }

        courses.push(course);
        lastCourse = course;

        // Forward-flush: pending subclass rows go to this new course.
        // On period change, flush remaining pending to the last course first.
        const periodKey = `${currentDay}:${currentPeriod}`;
        if (periodKey !== lastPeriodKey && pendingSubClassRows.length > 0) {
          // Period changed — flush leftover pending to last course (backward)
          if (currentBaseCourse) {
            for (const pending of pendingSubClassRows) {
              attachSubClassRow(currentBaseCourse, pending, courses);
            }
          }
          pendingSubClassRows = [];
        }
        lastPeriodKey = periodKey;

        // Forward-flush pending subclass rows to THIS course
        if (pendingSubClassRows.length > 0) {
          for (const pending of pendingSubClassRows) {
            attachSubClassRow(course, pending, courses);
          }
          pendingSubClassRows = [];
        }

        currentBaseCourse = course;
      }
    }
  }

  // Flush any remaining pending subclass rows to the last course
  if (pendingSubClassRows.length > 0 && currentBaseCourse) {
    for (const pending of pendingSubClassRows) {
      attachSubClassRow(currentBaseCourse, pending, courses);
    }
    pendingSubClassRows = [];
  }

  // Post-process
  for (const c of courses) {
    if (c.note === "") c.note = null;
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

    if (course.classroom) {
      const classroomWithNoDash = course.classroom.replace(/\s*[-－]\s*$/, "").trim();
      const classroomMatch = classroomWithNoDash.match(/(?:記念会館|[A-Z]-\d{3}(?:他)?(?:[，,、 ]\d{3})*|[A-Z]-\d{3}】【[A-Z]-\d{3}|\d-\d{3})/);

      if (classroomMatch) {
        const leadingText = classroomWithNoDash.slice(0, classroomMatch.index).trim();
        if (leadingText) {
          if (Array.isArray(course.instructor) && course.instructor.length > 0) {
            const instructors = [...course.instructor];
            instructors[instructors.length - 1] = normalizeCompactText(`${instructors[instructors.length - 1]} ${leadingText}`);
            course.instructor = instructors;
          } else if (typeof course.instructor === "string" && course.instructor) {
            course.instructor = normalizeCompactText(`${course.instructor} ${leadingText}`);
          }
        }

        course.classroom = classroomWithNoDash.slice(classroomMatch.index).trim() || null;
      } else if (/^[^A-Z\d]+$/.test(classroomWithNoDash.replace(/[\s,，、]/g, ""))) {
        if (Array.isArray(course.instructor) && course.instructor.length > 0) {
          const instructors = [...course.instructor];
          instructors[instructors.length - 1] = normalizeCompactText(`${instructors[instructors.length - 1]} ${classroomWithNoDash}`);
          course.instructor = instructors;
        } else if (typeof course.instructor === "string" && course.instructor) {
          course.instructor = normalizeCompactText(`${course.instructor} ${classroomWithNoDash}`);
        }

        course.classroom = null;
      }
    }

    if ((course.features == null || course.features === "") && ((typeof course.note === "string" && course.note.includes("メディア授業")) || originalCourse.includes("メディア授業"))) {
      course.features = "メディア授業";
    }

    if (course.credits === 0 && inferredCredit) {
      course.credits = parseInt(inferredCredit);
    }
  }

  // Fix credits=0: propagate credits from any sibling with same course name
  const creditsByName = new Map<string, number>();
  for (const c of courses) {
    if (c.credits > 0) {
      const prev = creditsByName.get(c.course) ?? 0;
      creditsByName.set(c.course, Math.max(prev, c.credits));
    }
  }
  for (const c of courses) {
    if (c.credits === 0) {
      c.credits = creditsByName.get(c.course) ?? 0;
    }
    if (c.credits === 0) {
      c.credits = inferCreditsFromCourse(c);
    }
  }

  // Fix on-demand / 集中 courses: if period is null/"-"/"－", set day to null too
  for (const c of courses) {
    if (c.period === null) c.day = null;
  }

  for (const c of courses) {
    if (c.day === null) {
      c.features = inferFeatureForNullDayCourse(c);
    }
  }

  const sortedCourses = courses
    .map((course, index) => ({ course, index }))
    .sort((left, right) => {
      const order = compareCourseOrder(left.course, right.course);
      return order !== 0 ? order : left.index - right.index;
    })
    .map(({ course }) => course);

  await pdf.destroy();

  return sortedCourses;
}

// ----------------------------------------------------------------
// CLI
// ----------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  let filePath = "";
  let outPath = "";

  if (args.includes("--help") || args.includes("-h")) {
    console.log("Usage: tsx scripts/parse-pdf.ts --file <pdf-path> [--out <json-path>]");
    return;
  }

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--file" && args[i + 1]) {
      filePath = resolve(args[i + 1]);
      i++;
    } else if (args[i] === "--out" && args[i + 1]) {
      outPath = resolve(args[i + 1]);
      i++;
    }
  }

  if (!filePath) {
    console.error("Usage: tsx scripts/parse-pdf.ts --file <pdf-path> [--out <json-path>]");
    process.exit(1);
  }

  if (!outPath) {
    outPath = filePath.replace(/\.pdf$/i, ".json");
  }

  console.log(`Parsing: ${filePath}`);
  const courses = await parsePdf(filePath);
  console.log(`Extracted ${courses.length} course entries`);

  writeFileSync(outPath, JSON.stringify(courses, null, 2), "utf-8");
  console.log(`Written to: ${outPath}`);
}

main().catch((err) => {
  console.error("Parse failed:", err);
  process.exit(1);
});
