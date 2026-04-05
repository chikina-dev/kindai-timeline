import { readFileSync } from "fs";
import { resolve } from "path";
import { config } from "dotenv";
import { load } from "cheerio";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq } from "drizzle-orm";
import { isRequirement, type Requirement } from "@/types/course-domain";
import { courses } from "../src/lib/db/schema";

config({ path: ".env" });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Add it to .env before running this script.");
}

const sql = neon(process.env.DATABASE_URL);
const db = drizzle({ client: sql });

type Semester = "前期" | "後期";

type Options = {
  filePath: string;
  year: number;
  department: string;
  semester: Semester | null;
  apply: boolean;
  overwrite: boolean;
  resolveDuplicateGroups: boolean;
};

type HtmlSyllabusRow = {
  rowNumber: number;
  syllabusId: string;
  requirementType: Requirement | null;
  department: string;
  semester: string;
  semesterKey: string;
  name: string;
  nameKey: string;
  instructor: string;
  instructorTokens: string[];
  gradeValues: number[] | null;
  credits: number | null;
  category: string;
  categoryKey: string | null;
};

type DbCourseRow = {
  id: string;
  syllabusId: string | null;
  requirementType: Requirement | null;
  semester: string;
  semesterKey: string;
  department: string;
  name: string;
  nameKey: string;
  credits: number;
  category: string;
  categoryKey: string | null;
  grades: number[] | null;
  instructors: string[] | null;
  className: string | null;
  day: string | null;
  periods: number[] | null;
  instructorTokens: string[];
};

type MatchResult =
  | { status: "matched"; course: DbCourseRow; tier: string }
  | { status: "ambiguous"; tier: string; candidates: DbCourseRow[] }
  | { status: "no-match"; reason: string; candidates: DbCourseRow[] };

type RequirementOnlyMatch = {
  requirementType: Requirement;
  tier: string;
};

type PendingResolutionRow = {
  row: HtmlSyllabusRow;
  source: "ambiguous" | "unmatched";
};

const DEFAULT_FILE_PATH = resolve(__dirname, "../data/html/syllabus.html");

const CATEGORY_ALIASES: Record<string, string> = {
  共通教養科目: "共通教養",
  共通教養: "共通教養",
  外国語科目: "外国語",
  外国語: "外国語",
  専門科目: "専門",
  専門: "専門",
};

const COURSE_NAME_ALIASES: Record<string, string> = {
  セキュリティ技術評価と実装技術: "セキュリティ技術評価と実装",
};

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .replace(/[\u00a0\u3000\s]+/g, " ")
    .trim();
}

function normalizeCompact(value: string | null | undefined): string {
  return normalizeText(value).replace(/\s+/g, "").toLowerCase();
}

function normalizeCourseName(value: string | null | undefined): string {
  const normalized = normalizeCompact(value)
    .replace(/[<＜][^>＞]+[>＞]/g, "")
    .replace(/※/g, "");

  return COURSE_NAME_ALIASES[normalized] ?? normalized;
}

function stripInstructorAnnotations(value: string): string {
  return normalizeText(value)
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/※.*$/g, "")
    .trim();
}

function toInstructorTokens(value: string | string[] | null | undefined): string[] {
  const joined = Array.isArray(value) ? value.join("、") : (value ?? "");
  const normalized = stripInstructorAnnotations(joined);

  return normalized
    .split(/[、,，/／;；]+/)
    .map((token) => normalizeText(token).replace(/\s*\d+$/g, ""))
    .map((token) => normalizeCompact(token))
    .filter(Boolean);
}

function parseNumbers(value: string | null | undefined): number[] | null {
  const matches = normalizeText(value).match(/\d+/g);
  if (!matches) return null;

  const numbers = matches
    .map((match) => Number.parseInt(match, 10))
    .filter((number) => Number.isFinite(number));

  return numbers.length > 0 ? numbers : null;
}

function parseCredits(value: string | null | undefined): number | null {
  const grades = parseNumbers(value);
  return grades?.[0] ?? null;
}

function normalizeCategory(value: string | null | undefined): string | null {
  const normalized = normalizeText(value).replace(/\s+/g, "");
  if (!normalized) return null;
  return CATEGORY_ALIASES[normalized] ?? normalized.replace(/科目$/, "");
}

function parseOptions(): Options {
  const args = process.argv.slice(2);
  let filePath = DEFAULT_FILE_PATH;
  let year = new Date().getFullYear();
  let department = "情報学部";
  let semester: Semester | null = null;
  let apply = false;
  let overwrite = false;
  let resolveDuplicateGroups = false;

  if (args.includes("--help") || args.includes("-h")) {
    console.log(
      [
        "Usage: tsx scripts/link-syllabus-ids.ts [options]",
        "",
        "Options:",
        "  --file <path>         HTML file to parse (default: data/html/syllabus.html)",
        "  --year <yyyy>         Academic year to update (default: current year)",
        "  --department <name>   Department to update (default: 情報学部)",
        "  --semester <前期|後期> Limit updates to a single semester",
        "  --apply               Write updates to the database",
        "  --overwrite           Replace existing syllabus_id values when they differ",
        "  --resolve-duplicate-groups",
        "                        Heuristically assign duplicate visible rows by stable order",
      ].join("\n")
    );
    process.exit(0);
  }

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--file" && next) {
      filePath = resolve(next);
      index++;
      continue;
    }

    if (arg === "--year" && next) {
      year = Number.parseInt(next, 10);
      index++;
      continue;
    }

    if (arg === "--department" && next) {
      department = next;
      index++;
      continue;
    }

    if (arg === "--semester" && next) {
      if (next !== "前期" && next !== "後期") {
        throw new Error(`Invalid semester: ${next}`);
      }

      semester = next;
      index++;
      continue;
    }

    if (arg === "--apply") {
      apply = true;
      continue;
    }

    if (arg === "--overwrite") {
      overwrite = true;
      continue;
    }

    if (arg === "--resolve-duplicate-groups") {
      resolveDuplicateGroups = true;
    }
  }

  if (!Number.isFinite(year)) {
    throw new Error("--year must be a valid number");
  }

  return {
    filePath,
    year,
    department,
    semester,
    apply,
    overwrite,
    resolveDuplicateGroups,
  };
}

function parseHtmlRows(filePath: string): HtmlSyllabusRow[] {
  const html = readFileSync(filePath, "utf8");
  const $ = load(html);
  const rows: HtmlSyllabusRow[] = [];
  let previousSemester = "";
  let previousGradeValues: number[] | null = null;
  let previousCredits: number | null = null;
  let previousCategory = "";

  $("#gvList tbody tr")
    .slice(1)
    .each((index, tr) => {
      const cells = $(tr).find("td");
      if (cells.length < 10) return;

      const link = $(cells[2]).find("a[href*='syllabusopen']").first();
      if (!link.length) return;

      const href = link.attr("href") ?? "";
      const syllabusMatch = href.match(/syllabusopen\('([^']+)'\)/);
      const syllabusId = syllabusMatch?.[1];
      if (!syllabusId) return;

      const department = normalizeText($(cells[0]).text());
      const semesterText = normalizeText($(cells[6]).text());
      const name = normalizeText(link.text());
      const instructor = normalizeText($(cells[3]).text());
      const gradeValues = parseNumbers($(cells[4]).text()) ?? previousGradeValues;
      const credits = parseCredits($(cells[5]).text()) ?? previousCredits;
      const semester = semesterText || previousSemester;
      const category = normalizeText($(cells[8]).text()) || previousCategory;
      const rawRequirementType = normalizeText($(cells[9]).text());
      const requirementType =
        rawRequirementType && isRequirement(rawRequirementType)
          ? rawRequirementType
          : null;

      previousSemester = semester;
      previousGradeValues = gradeValues;
      previousCredits = credits;
      previousCategory = category;

      rows.push({
        rowNumber: index + 2,
        syllabusId,
        requirementType,
        department,
        semester,
        semesterKey: normalizeCompact(semester),
        name,
        nameKey: normalizeCourseName(name),
        instructor,
        instructorTokens: toInstructorTokens(instructor),
        gradeValues,
        credits,
        category,
        categoryKey: normalizeCategory(category),
      });
    });

  return rows;
}

function sameValues(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;

  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();

  return leftSorted.every((value, index) => value === rightSorted[index]);
}

function compareInstructorTokens(
  htmlTokens: string[],
  dbTokens: string[]
): "exact" | "overlap" | "missing" | "mismatch" {
  if (htmlTokens.length === 0 || dbTokens.length === 0) {
    return "missing";
  }

  if (sameValues(htmlTokens, dbTokens)) {
    return "exact";
  }

  const overlaps = htmlTokens.some((token) => dbTokens.includes(token));
  return overlaps ? "overlap" : "mismatch";
}

function matchesGrades(htmlGrades: number[] | null, dbGrades: number[] | null): boolean {
  if (!htmlGrades?.length || !dbGrades?.length) {
    return true;
  }

  return htmlGrades.some((grade) => dbGrades.includes(grade));
}

function matchesCategory(htmlCategory: string | null, dbCategory: string | null): boolean {
  if (!htmlCategory || !dbCategory) {
    return true;
  }

  return htmlCategory === dbCategory;
}

function matchesRequirement(
  htmlRequirement: Requirement | null,
  dbRequirement: Requirement | null
): boolean {
  if (!htmlRequirement || !dbRequirement) {
    return true;
  }

  return htmlRequirement === dbRequirement;
}

function isMetadataUpToDate(row: HtmlSyllabusRow, course: DbCourseRow): boolean {
  return (
    course.syllabusId === row.syllabusId &&
    (row.requirementType == null || course.requirementType === row.requirementType)
  );
}

function hasSyllabusConflict(row: HtmlSyllabusRow, course: DbCourseRow): boolean {
  return Boolean(course.syllabusId && course.syllabusId !== row.syllabusId);
}

function describeHtmlRow(row: HtmlSyllabusRow): string {
  return [
    `row=${row.rowNumber}`,
    `semester=${row.semester || "-"}`,
    `name=${row.name || "-"}`,
    `instructor=${row.instructor || "-"}`,
    `credits=${row.credits ?? "-"}`,
    `requirement=${row.requirementType ?? "-"}`,
    `syllabusId=${row.syllabusId}`,
  ].join(" | ");
}

function describeDbCourse(course: DbCourseRow): string {
  const instructors = course.instructors?.join("、") ?? "-";
  return [
    `id=${course.id}`,
    `semester=${course.semester}`,
    `name=${course.name}`,
    `class=${course.className ?? "-"}`,
    `day=${course.day ?? "-"}`,
    `periods=${course.periods?.join(",") ?? "-"}`,
    `instructors=${instructors}`,
    `credits=${course.credits}`,
    `grades=${course.grades?.join(",") ?? "-"}`,
    `requirement=${course.requirementType ?? "-"}`,
    `syllabusId=${course.syllabusId ?? "-"}`,
  ].join(" | ");
}

function buildRowSignature(row: HtmlSyllabusRow): string {
  const gradeKey = row.gradeValues ? [...row.gradeValues].sort((left, right) => left - right).join(",") : "-";
  const instructorKey = [...row.instructorTokens].sort().join(",");

  return [
    row.semesterKey,
    row.nameKey,
    row.credits ?? "-",
    gradeKey,
    row.categoryKey ?? "-",
    instructorKey,
  ].join("|");
}

function buildNameGroupSignature(
  row: Pick<HtmlSyllabusRow, "semesterKey" | "nameKey" | "categoryKey">,
  includeSemester: boolean
): string {
  return [
    includeSemester ? row.semesterKey : "*",
    row.nameKey,
    row.categoryKey ?? "-",
  ].join("|");
}

function buildCourseNameGroupSignature(
  course: Pick<DbCourseRow, "semesterKey" | "nameKey" | "categoryKey">,
  includeSemester: boolean
): string {
  return [
    includeSemester ? course.semesterKey : "*",
    course.nameKey,
    course.categoryKey ?? "-",
  ].join("|");
}

function buildRequirementSignature(
  entry: Pick<HtmlSyllabusRow | DbCourseRow, "nameKey" | "credits" | "categoryKey">,
  semesterKey?: string
): string {
  return [
    semesterKey ?? "*",
    entry.nameKey,
    entry.credits,
    entry.categoryKey ?? "-",
  ].join("|");
}

function buildRequirementSignatureWithoutCategory(
  entry: Pick<HtmlSyllabusRow | DbCourseRow, "nameKey" | "credits">,
  semesterKey?: string
): string {
  return [semesterKey ?? "*", entry.nameKey, entry.credits].join("|");
}

function buildRequirementNameOnlySignature(
  entry: Pick<HtmlSyllabusRow | DbCourseRow, "nameKey">,
  semesterKey?: string
): string {
  return [semesterKey ?? "*", entry.nameKey].join("|");
}

function collectUniqueRequirementMap(
  rows: HtmlSyllabusRow[],
  keyBuilder: (row: HtmlSyllabusRow) => string
): Map<string, Requirement> {
  const grouped = new Map<string, Set<Requirement>>();

  for (const row of rows) {
    if (!row.requirementType) {
      continue;
    }

    const key = keyBuilder(row);
    const bucket = grouped.get(key);

    if (bucket) {
      bucket.add(row.requirementType);
    } else {
      grouped.set(key, new Set([row.requirementType]));
    }
  }

  const uniqueRequirements = new Map<string, Requirement>();

  for (const [key, bucket] of grouped.entries()) {
    if (bucket.size === 1) {
      uniqueRequirements.set(key, [...bucket][0]);
    }
  }

  return uniqueRequirements;
}

function findRequirementOnlyMatch(
  course: DbCourseRow,
  bySemester: Map<string, Requirement>,
  yearLong: Map<string, Requirement>,
  anySemester: Map<string, Requirement>,
  bySemesterWithoutCategory: Map<string, Requirement>,
  bySemesterNameOnly: Map<string, Requirement>
): RequirementOnlyMatch | null {
  const sameSemesterKey = buildRequirementSignature(course, course.semesterKey);
  const sameSemesterRequirement = bySemester.get(sameSemesterKey);

  if (sameSemesterRequirement) {
    return {
      requirementType: sameSemesterRequirement,
      tier: "requirement-only(same-semester)",
    };
  }

  const yearLongRequirement = yearLong.get(buildRequirementSignature(course));
  if (yearLongRequirement) {
    return {
      requirementType: yearLongRequirement,
      tier: "requirement-only(year-long)",
    };
  }

  const anySemesterRequirement = anySemester.get(buildRequirementSignature(course));
  if (anySemesterRequirement) {
    return {
      requirementType: anySemesterRequirement,
      tier: "requirement-only(any-semester)",
    };
  }

  const sameSemesterWithoutCategory = bySemesterWithoutCategory.get(
    buildRequirementSignatureWithoutCategory(course, course.semesterKey)
  );
  if (sameSemesterWithoutCategory) {
    return {
      requirementType: sameSemesterWithoutCategory,
      tier: "requirement-only(same-semester,no-category)",
    };
  }

  const sameSemesterNameOnly = bySemesterNameOnly.get(
    buildRequirementNameOnlySignature(course, course.semesterKey)
  );
  if (sameSemesterNameOnly) {
    return {
      requirementType: sameSemesterNameOnly,
      tier: "requirement-only(same-semester,name-only)",
    };
  }

  return null;
}

const DAY_ORDER: Record<string, number> = {
  月: 1,
  火: 2,
  水: 3,
  木: 4,
  金: 5,
  土: 6,
  日: 7,
};

const SEMESTER_ORDER: Record<string, number> = {
  前期: 1,
  後期: 2,
  通年: 3,
};

function compareDbCourseOrder(left: DbCourseRow, right: DbCourseRow): number {
  const leftSemester = SEMESTER_ORDER[left.semester] ?? Number.MAX_SAFE_INTEGER;
  const rightSemester = SEMESTER_ORDER[right.semester] ?? Number.MAX_SAFE_INTEGER;
  if (leftSemester !== rightSemester) {
    return leftSemester - rightSemester;
  }

  const leftClass = normalizeCompact(left.className ?? "~");
  const rightClass = normalizeCompact(right.className ?? "~");
  if (leftClass !== rightClass) {
    return leftClass.localeCompare(rightClass, "ja");
  }

  const leftDay = DAY_ORDER[left.day ?? ""] ?? Number.MAX_SAFE_INTEGER;
  const rightDay = DAY_ORDER[right.day ?? ""] ?? Number.MAX_SAFE_INTEGER;
  if (leftDay !== rightDay) {
    return leftDay - rightDay;
  }

  const leftPeriod = left.periods?.[0] ?? Number.MAX_SAFE_INTEGER;
  const rightPeriod = right.periods?.[0] ?? Number.MAX_SAFE_INTEGER;
  if (leftPeriod !== rightPeriod) {
    return leftPeriod - rightPeriod;
  }

  return left.id.localeCompare(right.id);
}

function resolveAmbiguousGroupsByOrder(
  entries: Array<{ row: HtmlSyllabusRow; tier: string; candidates: DbCourseRow[] }>,
  usedCourseIds: Set<string>
): {
  resolved: Array<{ row: HtmlSyllabusRow; course: DbCourseRow; tier: string }>;
  unresolved: Array<{ row: HtmlSyllabusRow; tier: string; candidates: DbCourseRow[] }>;
} {
  const groupedEntries = new Map<string, Array<{ row: HtmlSyllabusRow; tier: string; candidates: DbCourseRow[] }>>();

  for (const entry of entries) {
    const key = buildRowSignature(entry.row);
    const bucket = groupedEntries.get(key);
    if (bucket) {
      bucket.push(entry);
    } else {
      groupedEntries.set(key, [entry]);
    }
  }

  const resolved: Array<{ row: HtmlSyllabusRow; course: DbCourseRow; tier: string }> = [];
  const unresolved: Array<{ row: HtmlSyllabusRow; tier: string; candidates: DbCourseRow[] }> = [];

  for (const group of groupedEntries.values()) {
    const candidateMap = new Map<string, DbCourseRow>();

    for (const entry of group) {
      for (const candidate of entry.candidates) {
        if (!usedCourseIds.has(candidate.id)) {
          candidateMap.set(candidate.id, candidate);
        }
      }
    }

    const candidateIds = [...candidateMap.keys()];
    const everyRowHasSameUniverse = group.every((entry) => {
      if (entry.candidates.length !== candidateIds.length) {
        return false;
      }

      return entry.candidates.every((candidate) => candidateMap.has(candidate.id));
    });

    if (!everyRowHasSameUniverse || candidateIds.length !== group.length) {
      unresolved.push(...group);
      continue;
    }

    const orderedRows = [...group].sort((left, right) => left.row.rowNumber - right.row.rowNumber);
    const orderedCandidates = [...candidateMap.values()].sort(compareDbCourseOrder);

    for (let index = 0; index < orderedRows.length; index++) {
      const entry = orderedRows[index];
      const candidate = orderedCandidates[index];
      usedCourseIds.add(candidate.id);
      resolved.push({
        row: entry.row,
        course: candidate,
        tier: `${entry.tier}+ordered-group`,
      });
    }
  }

  return { resolved, unresolved };
}

function resolvePendingRowsByNameGroups(
  entries: PendingResolutionRow[],
  coursesPool: DbCourseRow[],
  usedCourseIds: Set<string>,
  includeSemester: boolean,
  tierLabel: string
): {
  resolved: Array<{ row: HtmlSyllabusRow; course: DbCourseRow; tier: string }>;
  unresolved: PendingResolutionRow[];
} {
  const groups = new Map<string, PendingResolutionRow[]>();

  for (const entry of entries) {
    const key = buildNameGroupSignature(entry.row, includeSemester);
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(entry);
    } else {
      groups.set(key, [entry]);
    }
  }

  const resolved: Array<{ row: HtmlSyllabusRow; course: DbCourseRow; tier: string }> = [];
  const unresolved: PendingResolutionRow[] = [];

  for (const [groupKey, groupEntries] of groups.entries()) {
    const candidates = coursesPool
      .filter((course) => !usedCourseIds.has(course.id))
      .filter(
        (course) =>
          buildCourseNameGroupSignature(course, includeSemester) === groupKey
      )
      .sort(compareDbCourseOrder);

    if (candidates.length !== groupEntries.length || candidates.length === 0) {
      unresolved.push(...groupEntries);
      continue;
    }

    const orderedRows = [...groupEntries].sort(
      (left, right) => left.row.rowNumber - right.row.rowNumber
    );

    for (let index = 0; index < orderedRows.length; index++) {
      const entry = orderedRows[index];
      const candidate = candidates[index];
      usedCourseIds.add(candidate.id);
      resolved.push({
        row: entry.row,
        course: candidate,
        tier: tierLabel,
      });
    }
  }

  return { resolved, unresolved };
}

function resolveAmbiguousRowsByFanout(
  entries: Array<{ row: HtmlSyllabusRow; tier: string; candidates: DbCourseRow[] }>,
  usedCourseIds: Set<string>
): {
  resolved: Array<{ row: HtmlSyllabusRow; course: DbCourseRow; tier: string }>;
  unresolved: Array<{ row: HtmlSyllabusRow; tier: string; candidates: DbCourseRow[] }>;
} {
  const candidateUsageCount = new Map<string, number>();

  for (const entry of entries) {
    for (const candidate of entry.candidates) {
      candidateUsageCount.set(
        candidate.id,
        (candidateUsageCount.get(candidate.id) ?? 0) + 1
      );
    }
  }

  const resolved: Array<{ row: HtmlSyllabusRow; course: DbCourseRow; tier: string }> = [];
  const unresolved: Array<{ row: HtmlSyllabusRow; tier: string; candidates: DbCourseRow[] }> = [];

  for (const entry of entries) {
    const availableCandidates = entry.candidates.filter(
      (candidate) => !usedCourseIds.has(candidate.id)
    );
    const allowsFanout = entry.tier.includes("instructor(");
    const hasExclusiveCandidates = availableCandidates.every(
      (candidate) => candidateUsageCount.get(candidate.id) === 1
    );

    if (!allowsFanout || availableCandidates.length < 2 || !hasExclusiveCandidates) {
      unresolved.push(entry);
      continue;
    }

    for (const candidate of availableCandidates) {
      usedCourseIds.add(candidate.id);
      resolved.push({
        row: entry.row,
        course: candidate,
        tier: `${entry.tier}+fanout`,
      });
    }
  }

  return { resolved, unresolved };
}

function resolveYearLongRowsAcrossSemesters(
  entries: PendingResolutionRow[],
  coursesPool: DbCourseRow[],
  usedCourseIds: Set<string>
): {
  resolved: Array<{ row: HtmlSyllabusRow; course: DbCourseRow; tier: string }>;
  unresolved: PendingResolutionRow[];
} {
  const candidateUsageCount = new Map<string, number>();
  const candidateMapByRow = new Map<number, DbCourseRow[]>();
  const yearLongSemesterKey = normalizeCompact("通年");

  for (const entry of entries) {
    if (entry.row.semesterKey !== yearLongSemesterKey) {
      continue;
    }

    const candidates = coursesPool.filter((course) => {
      if (usedCourseIds.has(course.id)) {
        return false;
      }

      if (course.nameKey !== entry.row.nameKey) {
        return false;
      }

      if (entry.row.credits != null && course.credits !== entry.row.credits) {
        return false;
      }

      if (!matchesGrades(entry.row.gradeValues, course.grades)) {
        return false;
      }

      if (!matchesCategory(entry.row.categoryKey, course.categoryKey)) {
        return false;
      }

      return (
        compareInstructorTokens(entry.row.instructorTokens, course.instructorTokens) === "exact"
      );
    });

    if (candidates.length === 0) {
      continue;
    }

    candidateMapByRow.set(entry.row.rowNumber, candidates);

    for (const candidate of candidates) {
      candidateUsageCount.set(
        candidate.id,
        (candidateUsageCount.get(candidate.id) ?? 0) + 1
      );
    }
  }

  const resolved: Array<{ row: HtmlSyllabusRow; course: DbCourseRow; tier: string }> = [];
  const unresolved: PendingResolutionRow[] = [];

  for (const entry of entries) {
    const candidates = candidateMapByRow.get(entry.row.rowNumber);

    if (!candidates || candidates.length === 0) {
      unresolved.push(entry);
      continue;
    }

    const hasExclusiveCandidates = candidates.every(
      (candidate) => candidateUsageCount.get(candidate.id) === 1
    );

    if (!hasExclusiveCandidates) {
      unresolved.push(entry);
      continue;
    }

    for (const candidate of candidates) {
      usedCourseIds.add(candidate.id);
      resolved.push({
        row: entry.row,
        course: candidate,
        tier: "year-long-fanout",
      });
    }
  }

  return { resolved, unresolved };
}

function findMatch(
  row: HtmlSyllabusRow,
  coursesForSemester: DbCourseRow[],
  usedCourseIds: Set<string>
): MatchResult {
  const nameCandidates = coursesForSemester.filter(
    (course) => !usedCourseIds.has(course.id) && course.nameKey === row.nameKey
  );

  if (nameCandidates.length === 0) {
    return { status: "no-match", reason: "name", candidates: [] };
  }

  const creditCandidates = row.credits == null
    ? nameCandidates
    : nameCandidates.filter((course) => course.credits === row.credits);

  const tierChecks: Array<{
    label: string;
    predicate: (course: DbCourseRow) => boolean;
  }> = [
    {
      label: "name+credits+instructor(exact)+grade+category",
      predicate: (course) =>
        compareInstructorTokens(row.instructorTokens, course.instructorTokens) === "exact" &&
        matchesGrades(row.gradeValues, course.grades) &&
        matchesCategory(row.categoryKey, course.categoryKey) &&
        matchesRequirement(row.requirementType, course.requirementType),
    },
    {
      label: "name+credits+instructor(overlap)+grade+category",
      predicate: (course) => {
        const relation = compareInstructorTokens(row.instructorTokens, course.instructorTokens);
        return (
          (relation === "exact" || relation === "overlap") &&
          matchesGrades(row.gradeValues, course.grades) &&
          matchesCategory(row.categoryKey, course.categoryKey) &&
          matchesRequirement(row.requirementType, course.requirementType)
        );
      },
    },
    {
      label: "name+credits+instructor(exact)+grade",
      predicate: (course) =>
        compareInstructorTokens(row.instructorTokens, course.instructorTokens) === "exact" &&
        matchesGrades(row.gradeValues, course.grades),
    },
    {
      label: "name+credits+instructor(overlap)+grade",
      predicate: (course) => {
        const relation = compareInstructorTokens(row.instructorTokens, course.instructorTokens);
        return (relation === "exact" || relation === "overlap") && matchesGrades(row.gradeValues, course.grades);
      },
    },
    {
      label: "name+credits+instructor(exact)",
      predicate: (course) => compareInstructorTokens(row.instructorTokens, course.instructorTokens) === "exact",
    },
    {
      label: "name+credits+instructor(overlap)",
      predicate: (course) => {
        const relation = compareInstructorTokens(row.instructorTokens, course.instructorTokens);
        return relation === "exact" || relation === "overlap";
      },
    },
    {
      label: "name+credits+grade+category",
      predicate: (course) =>
        matchesGrades(row.gradeValues, course.grades) &&
        matchesCategory(row.categoryKey, course.categoryKey) &&
        matchesRequirement(row.requirementType, course.requirementType),
    },
    {
      label: "name+credits+grade",
      predicate: (course) => matchesGrades(row.gradeValues, course.grades),
    },
  ];

  const mismatchTierChecks: Array<{
    label: string;
    predicate: (course: DbCourseRow) => boolean;
  }> = [
    {
      label: "name+instructor(exact)+grade+category+credit-mismatch",
      predicate: (course) =>
        compareInstructorTokens(row.instructorTokens, course.instructorTokens) === "exact" &&
        matchesGrades(row.gradeValues, course.grades) &&
        matchesCategory(row.categoryKey, course.categoryKey) &&
        matchesRequirement(row.requirementType, course.requirementType),
    },
    {
      label: "name+instructor(overlap)+grade+category+credit-mismatch",
      predicate: (course) => {
        const relation = compareInstructorTokens(row.instructorTokens, course.instructorTokens);
        return (
          (relation === "exact" || relation === "overlap") &&
          matchesGrades(row.gradeValues, course.grades) &&
          matchesCategory(row.categoryKey, course.categoryKey) &&
          matchesRequirement(row.requirementType, course.requirementType)
        );
      },
    },
    {
      label: "name+instructor(exact)+grade+credit-mismatch",
      predicate: (course) =>
        compareInstructorTokens(row.instructorTokens, course.instructorTokens) === "exact" &&
        matchesGrades(row.gradeValues, course.grades),
    },
  ];

  if (creditCandidates.length === 0) {
    for (const tier of mismatchTierChecks) {
      const matches = nameCandidates.filter(tier.predicate);

      if (matches.length === 1) {
        return {
          status: "matched",
          course: matches[0],
          tier: tier.label,
        };
      }
    }

    return {
      status: "no-match",
      reason: "credits",
      candidates: nameCandidates,
    };
  }

  for (const tier of tierChecks) {
    const matches = creditCandidates.filter(tier.predicate);

    if (matches.length === 1) {
      return {
        status: "matched",
        course: matches[0],
        tier: tier.label,
      };
    }

    if (matches.length > 1) {
      return {
        status: "ambiguous",
        tier: tier.label,
        candidates: matches,
      };
    }
  }

  if (creditCandidates.length === 1) {
    return {
      status: "matched",
      course: creditCandidates[0],
      tier: "name+credits",
    };
  }

  return {
    status: "ambiguous",
    tier: "name+credits",
    candidates: creditCandidates,
  };
}

async function main() {
  const options = parseOptions();

  console.log(`HTML file: ${options.filePath}`);
  console.log(`Academic year: ${options.year}`);
  console.log(`Department: ${options.department}`);
  console.log(`Semester filter: ${options.semester ?? "all"}`);
  console.log(`Mode: ${options.apply ? "apply" : "dry-run"}`);
  console.log(`Overwrite existing syllabus_id: ${options.overwrite ? "yes" : "no"}`);
  console.log(`Resolve duplicate groups by order: ${options.resolveDuplicateGroups ? "yes" : "no"}`);

  const parsedRows = parseHtmlRows(options.filePath).filter((row) => {
    if (row.department !== options.department) {
      return false;
    }

    if (options.semester && row.semester !== options.semester) {
      return false;
    }

    return true;
  });

  console.log(`Parsed ${parsedRows.length} syllabus rows after filtering`);

  const requirementBySemester = collectUniqueRequirementMap(
    parsedRows,
    (row) => buildRequirementSignature(row, row.semesterKey)
  );
  const yearLongSemesterKey = normalizeCompact("通年");
  const requirementByYearLong = collectUniqueRequirementMap(
    parsedRows.filter((row) => row.semesterKey === yearLongSemesterKey),
    (row) => buildRequirementSignature(row)
  );
  const requirementByAnySemester = collectUniqueRequirementMap(
    parsedRows,
    (row) => buildRequirementSignature(row)
  );
  const requirementBySemesterWithoutCategory = collectUniqueRequirementMap(
    parsedRows,
    (row) => buildRequirementSignatureWithoutCategory(row, row.semesterKey)
  );
  const requirementBySemesterNameOnly = collectUniqueRequirementMap(
    parsedRows,
    (row) => buildRequirementNameOnlySignature(row, row.semesterKey)
  );

  const conditions = [
    eq(courses.academicYear, options.year),
    eq(courses.department, options.department),
  ];

  if (options.semester) {
    conditions.push(eq(courses.semester, options.semester));
  }

  const dbRows = await db
    .select({
      id: courses.id,
      syllabusId: courses.syllabusId,
      requirementType: courses.requirementType,
      semester: courses.semester,
      department: courses.department,
      name: courses.name,
      credits: courses.credits,
      category: courses.category,
      grades: courses.grades,
      instructors: courses.instructors,
      className: courses.className,
      day: courses.day,
      periods: courses.periods,
    })
    .from(courses)
    .where(and(...conditions));

  const dbCourses = dbRows.map<DbCourseRow>((course) => ({
    ...course,
    semesterKey: normalizeCompact(course.semester),
    nameKey: normalizeCourseName(course.name),
    categoryKey: normalizeCategory(course.category),
    instructorTokens: toInstructorTokens(course.instructors),
  }));

  console.log(`Loaded ${dbCourses.length} courses from DB`);

  const coursesBySemester = new Map<string, DbCourseRow[]>();
  for (const course of dbCourses) {
    const key = course.semesterKey;
    const bucket = coursesBySemester.get(key);
    if (bucket) {
      bucket.push(course);
    } else {
      coursesBySemester.set(key, [course]);
    }
  }

  const usedCourseIds = new Set<string>();
  const updates: Array<{ row: HtmlSyllabusRow; course: DbCourseRow; tier: string }> = [];
  const requirementOnlyUpdates = new Map<string, {
    course: DbCourseRow;
    requirementType: Requirement;
    tier: string;
  }>();
  const unchanged: Array<{ row: HtmlSyllabusRow; course: DbCourseRow; tier: string }> = [];
  const conflicts: Array<{ row: HtmlSyllabusRow; course: DbCourseRow; tier: string }> = [];
  let unmatched: Array<{ row: HtmlSyllabusRow; reason: string; candidates: DbCourseRow[] }> = [];
  let ambiguous: Array<{ row: HtmlSyllabusRow; tier: string; candidates: DbCourseRow[] }> = [];

  const queueRequirementOnlyUpdate = (
    course: DbCourseRow,
    requirementType: Requirement | null,
    tier: string
  ) => {
    if (!requirementType || course.requirementType === requirementType) {
      return;
    }

    if (course.requirementType && course.requirementType !== requirementType) {
      return;
    }

    const existing = requirementOnlyUpdates.get(course.id);
    if (existing && existing.requirementType !== requirementType) {
      return;
    }

    requirementOnlyUpdates.set(course.id, {
      course,
      requirementType,
      tier,
    });
  };

  for (const row of parsedRows) {
    const coursesForSemester = coursesBySemester.get(row.semesterKey) ?? [];
    const match = findMatch(row, coursesForSemester, usedCourseIds);

    if (match.status === "no-match") {
      unmatched.push({ row, reason: match.reason, candidates: match.candidates });
      continue;
    }

    if (match.status === "ambiguous") {
      ambiguous.push({ row, tier: match.tier, candidates: match.candidates });
      continue;
    }

    usedCourseIds.add(match.course.id);

    if (isMetadataUpToDate(row, match.course)) {
      unchanged.push({ row, course: match.course, tier: match.tier });
      continue;
    }

    if (hasSyllabusConflict(row, match.course) && !options.overwrite) {
      conflicts.push({ row, course: match.course, tier: match.tier });
      queueRequirementOnlyUpdate(
        match.course,
        row.requirementType,
        `${match.tier}+conflict-requirement-only`
      );
      continue;
    }

    updates.push({ row, course: match.course, tier: match.tier });
  }

  let duplicateGroupUpdates = 0;
  let relaxedHeuristicUpdates = 0;

  if (options.resolveDuplicateGroups && ambiguous.length > 0) {
    const resolution = resolveAmbiguousGroupsByOrder(ambiguous, usedCourseIds);
    ambiguous = resolution.unresolved;

    for (const update of resolution.resolved) {
      if (isMetadataUpToDate(update.row, update.course)) {
        unchanged.push(update);
        continue;
      }

      if (hasSyllabusConflict(update.row, update.course) && !options.overwrite) {
        conflicts.push(update);
        queueRequirementOnlyUpdate(
          update.course,
          update.row.requirementType,
          `${update.tier}+conflict-requirement-only`
        );
        continue;
      }

      updates.push(update);
      duplicateGroupUpdates++;
    }
  }

  if (options.resolveDuplicateGroups && ambiguous.length > 0) {
    const resolution = resolveAmbiguousRowsByFanout(ambiguous, usedCourseIds);
    ambiguous = resolution.unresolved;

    for (const update of resolution.resolved) {
      if (isMetadataUpToDate(update.row, update.course)) {
        unchanged.push(update);
        continue;
      }

      if (hasSyllabusConflict(update.row, update.course) && !options.overwrite) {
        conflicts.push(update);
        queueRequirementOnlyUpdate(
          update.course,
          update.row.requirementType,
          `${update.tier}+conflict-requirement-only`
        );
        continue;
      }

      updates.push(update);
      relaxedHeuristicUpdates++;
    }
  }

  if (options.resolveDuplicateGroups) {
    const pendingRows: PendingResolutionRow[] = [
      ...ambiguous.map((entry) => ({ row: entry.row, source: "ambiguous" as const })),
      ...unmatched.map((entry) => ({ row: entry.row, source: "unmatched" as const })),
    ];

    const yearLongResolution = resolveYearLongRowsAcrossSemesters(
      pendingRows,
      dbCourses,
      usedCourseIds
    );

    const sameSemesterResolution = resolvePendingRowsByNameGroups(
      yearLongResolution.unresolved,
      dbCourses,
      usedCourseIds,
      true,
      "name-group(same-semester)"
    );

    const crossSemesterResolution = resolvePendingRowsByNameGroups(
      sameSemesterResolution.unresolved,
      dbCourses,
      usedCourseIds,
      false,
      "name-group(cross-semester)"
    );

    const nameGroupUpdates = [
      ...yearLongResolution.resolved,
      ...sameSemesterResolution.resolved,
      ...crossSemesterResolution.resolved,
    ];

    const unresolvedRowNumbers = new Set(
      crossSemesterResolution.unresolved.map((entry) => entry.row.rowNumber)
    );

    ambiguous = ambiguous.filter((entry) => unresolvedRowNumbers.has(entry.row.rowNumber));
    unmatched = unmatched.filter((entry) => unresolvedRowNumbers.has(entry.row.rowNumber));

    for (const update of nameGroupUpdates) {
      if (isMetadataUpToDate(update.row, update.course)) {
        unchanged.push(update);
        continue;
      }

      if (hasSyllabusConflict(update.row, update.course) && !options.overwrite) {
        conflicts.push(update);
        queueRequirementOnlyUpdate(
          update.course,
          update.row.requirementType,
          `${update.tier}+conflict-requirement-only`
        );
        continue;
      }

      updates.push(update);
      relaxedHeuristicUpdates++;
    }
  }

  const plannedRequirementTypes = new Map<string, Requirement | null>();
  for (const course of dbCourses) {
    plannedRequirementTypes.set(course.id, course.requirementType);
  }

  for (const entry of [...updates, ...unchanged, ...conflicts]) {
    plannedRequirementTypes.set(
      entry.course.id,
      entry.row.requirementType ?? plannedRequirementTypes.get(entry.course.id) ?? null
    );
  }

  for (const update of requirementOnlyUpdates.values()) {
    plannedRequirementTypes.set(update.course.id, update.requirementType);
  }

  for (const course of dbCourses) {
    const plannedRequirementType = plannedRequirementTypes.get(course.id) ?? null;
    if (plannedRequirementType) {
      continue;
    }

    const requirementMatch = findRequirementOnlyMatch(
      course,
      requirementBySemester,
      requirementByYearLong,
      requirementByAnySemester,
      requirementBySemesterWithoutCategory,
      requirementBySemesterNameOnly
    );

    if (!requirementMatch) {
      continue;
    }

    plannedRequirementTypes.set(course.id, requirementMatch.requirementType);
    queueRequirementOnlyUpdate(course, requirementMatch.requirementType, requirementMatch.tier);
  }

  const requirementOnlyUpdateList = [...requirementOnlyUpdates.values()];
  const requirementOnlyAssignments = requirementOnlyUpdateList.length;

  console.log(`Matched rows: ${updates.length + unchanged.length + conflicts.length}`);
  console.log(`Updates pending: ${updates.length}`);
  console.log(`Already up to date: ${unchanged.length}`);
  console.log(`Conflicts skipped: ${conflicts.length}`);
  console.log(`Ambiguous skipped: ${ambiguous.length}`);
  console.log(`Unmatched skipped: ${unmatched.length}`);
  console.log(`Duplicate-group heuristic matches: ${duplicateGroupUpdates}`);
  console.log(`Relaxed heuristic matches: ${relaxedHeuristicUpdates}`);
  console.log(`Requirement-only assignments: ${requirementOnlyAssignments}`);

  if (updates.length > 0) {
    console.log("\nSample updates:");
    for (const update of updates.slice(0, 10)) {
      console.log(`- ${describeHtmlRow(update.row)}`);
      console.log(`  -> ${describeDbCourse(update.course)} [${update.tier}]`);
    }
  }

  if (conflicts.length > 0) {
    console.log("\nSample conflicts:");
    for (const conflict of conflicts.slice(0, 10)) {
      console.log(`- ${describeHtmlRow(conflict.row)}`);
      console.log(`  -> ${describeDbCourse(conflict.course)} [${conflict.tier}]`);
    }
  }

  if (requirementOnlyUpdateList.length > 0) {
    console.log("\nSample requirement-only updates:");
    for (const update of requirementOnlyUpdateList.slice(0, 10)) {
      console.log(`- ${describeDbCourse(update.course)}`);
      console.log(`  -> requirement=${update.requirementType} [${update.tier}]`);
    }
  }

  if (ambiguous.length > 0) {
    console.log("\nSample ambiguous rows:");
    for (const entry of ambiguous.slice(0, 10)) {
      console.log(`- ${describeHtmlRow(entry.row)} [${entry.tier}]`);
      for (const candidate of entry.candidates.slice(0, 3)) {
        console.log(`  -> ${describeDbCourse(candidate)}`);
      }
    }
  }

  if (unmatched.length > 0) {
    console.log("\nSample unmatched rows:");
    for (const entry of unmatched.slice(0, 10)) {
      console.log(`- ${describeHtmlRow(entry.row)} [reason=${entry.reason}]`);
      for (const candidate of entry.candidates.slice(0, 3)) {
        console.log(`  -> ${describeDbCourse(candidate)}`);
      }
    }
  }

  if (!options.apply) {
    console.log("\nDry run only. Re-run with --apply to persist updates.");
    return;
  }

  for (const update of updates) {
    await db
      .update(courses)
      .set({
        syllabusId: update.row.syllabusId,
        requirementType: update.row.requirementType ?? update.course.requirementType,
      })
      .where(eq(courses.id, update.course.id));
  }

  for (const update of requirementOnlyUpdateList) {
    await db
      .update(courses)
      .set({ requirementType: update.requirementType })
      .where(eq(courses.id, update.course.id));
  }

  console.log(
    `\nUpdated ${updates.length} course rows and ${requirementOnlyUpdateList.length} requirement-only rows.`
  );
}

main().catch((error) => {
  console.error("Failed to sync syllabus metadata:", error);
  process.exit(1);
});