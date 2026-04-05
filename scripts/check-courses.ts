import { readFileSync } from "fs";
import { resolve } from "path";

type Scalar = string | number | null;

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

const DAYS = ["月", "火", "水", "木", "金", "土", "日"] as const;
const FEATURES = ["KICSオンデマンド", "メディア授業", "専門科目オンデマンド"] as const;
const ZERO_CREDIT_ALLOWED_COURSES = new Set(["科学的問題解決法", "深層学習"]);
const DAY_ORDER = new Map(DAYS.map((day, index) => [day, index]));
const FEATURE_SET = new Set<string>(FEATURES);
const LONG_TEXT_THRESHOLDS = {
  course: 30,
  class: 20,
  classroom: 20,
  instructor: 40,
  note: 50,
  features: 20,
};

function toArray<T>(value: T | T[] | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function getPrimaryPeriod(period: number | number[] | null): number | null {
  if (period == null) return null;
  return Array.isArray(period) ? (period[0] ?? null) : period;
}

function getDayRank(day: string | null): number {
  if (day == null) return Number.MAX_SAFE_INTEGER;
  return DAY_ORDER.get(day as (typeof DAYS)[number]) ?? Number.MAX_SAFE_INTEGER - 1;
}

function compareCourseOrder(left: RawCourse, right: RawCourse): number {
  const dayDiff = getDayRank(left.day) - getDayRank(right.day);
  if (dayDiff !== 0) return dayDiff;

  const leftPeriod = getPrimaryPeriod(left.period);
  const rightPeriod = getPrimaryPeriod(right.period);

  if (leftPeriod == null && rightPeriod != null) return 1;
  if (leftPeriod != null && rightPeriod == null) return -1;
  if (leftPeriod != null && rightPeriod != null && leftPeriod !== rightPeriod) {
    return leftPeriod - rightPeriod;
  }

  return 0;
}

function formatValue(value: Scalar | Scalar[]): string {
  if (Array.isArray(value)) {
    return value.map((item) => formatValue(item)).join(", ");
  }
  return value == null ? "null" : String(value);
}

function courseLabel(course: RawCourse, index: number): string {
  return `#${index + 1} ${course.course}${course.class ? ` (${course.class})` : ""}`;
}

function normalizeCourseName(courseName: string): string {
  return courseName.replace(/\s+/g, "").trim();
}

function parseArgs() {
  const args = process.argv.slice(2);
  let filePath = resolve("data/courses-2026-後期.json");

  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--file" && args[index + 1]) {
      filePath = resolve(args[index + 1]);
      index++;
    }
  }

  return { filePath };
}

function main() {
  const { filePath } = parseArgs();
  const raw = JSON.parse(readFileSync(filePath, "utf-8")) as RawCourse[];

  const errors: string[] = [];
  const warnings: string[] = [];

  raw.forEach((course, index) => {
    if (course.day != null && !DAY_ORDER.has(course.day as (typeof DAYS)[number])) {
      errors.push(`${courseLabel(course, index)}: invalid day \`${course.day}\``);
    }

    if (course.day == null && course.period != null) {
      errors.push(`${courseLabel(course, index)}: period exists but day is null`);
    }

    const periods = toArray(course.period);
    if (periods.some((period) => !Number.isInteger(period) || period < 1 || period > 8)) {
      errors.push(`${courseLabel(course, index)}: invalid period \`${formatValue(course.period)}\``);
    }

    if (!course.category.trim()) {
      errors.push(`${courseLabel(course, index)}: empty category`);
    }

    if (!course.course.trim()) {
      errors.push(`${courseLabel(course, index)}: empty course name`);
    }

    const normalizedCourseName = normalizeCourseName(course.course);
    const zeroCreditAllowed = ZERO_CREDIT_ALLOWED_COURSES.has(normalizedCourseName);
    const validCredits = zeroCreditAllowed ? [0, 1, 2, 3] : [1, 2, 3];
    if (!Number.isFinite(course.credits) || !validCredits.includes(course.credits)) {
      errors.push(`${courseLabel(course, index)}: credits must be ${zeroCreditAllowed ? "0, 1, 2 or 3" : "1, 2 or 3"} (got \`${course.credits}\`)`);
    }

    if (course.features != null && !FEATURE_SET.has(course.features)) {
      errors.push(`${courseLabel(course, index)}: invalid feature \`${course.features}\``);
    }

    if (course.day == null && course.features == null) {
      errors.push(`${courseLabel(course, index)}: day is null but feature is missing`);
    }

    const textFields: Array<[keyof typeof LONG_TEXT_THRESHOLDS, string | null]> = [
      ["course", course.course],
      ["class", course.class],
      ["classroom", course.classroom],
      ["instructor", Array.isArray(course.instructor) ? course.instructor.join("、") : course.instructor],
      ["note", course.note],
      ["features", course.features],
    ];

    for (const [field, value] of textFields) {
      if (!value) continue;
      const normalized = value.replace(/\s+/g, " ").trim();
      if (normalized.length > LONG_TEXT_THRESHOLDS[field]) {
        warnings.push(
          `${courseLabel(course, index)}: ${field} is long (${normalized.length} chars) -> ${normalized}`
        );
      }
    }
  });

  for (let index = 1; index < raw.length; index++) {
    const previous = raw[index - 1];
    const current = raw[index];
    if (compareCourseOrder(previous, current) > 0) {
      errors.push(
        [
          `order mismatch between #${index} and #${index + 1}`,
          `prev: ${previous.day ?? "null"}/${formatValue(previous.period)} ${previous.course}`,
          `curr: ${current.day ?? "null"}/${formatValue(current.period)} ${current.course}`,
        ].join(" | ")
      );
    }
  }

  console.log(`Checked ${raw.length} courses from ${filePath}`);

  if (warnings.length > 0) {
    console.warn(`WARN: ${warnings.length}`);
    for (const warning of warnings) {
      console.warn(`  - ${warning}`);
    }
  }

  if (errors.length > 0) {
    console.error(`ERROR: ${errors.length}`);
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }

  console.log("Check passed");
}

main();