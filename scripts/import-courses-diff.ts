import { readFileSync } from "fs";
import { resolve } from "path";

import { neon } from "@neondatabase/serverless";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { config } from "dotenv";

import { courses, type NewCourse } from "../src/lib/db/schema";
import {
  type Category,
  type Semester,
  isDayOfWeek,
  isFeature,
  isRequirement,
} from "@/types/course-domain";

config({ path: ".env" });

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle({ client: sql });

type RawCourse = {
  day: string | null;
  period: number | number[] | null;
  category: Category;
  grade: number | number[] | null;
  course: string;
  class: string | null;
  classroom: string | null;
  credits: number;
  instructor: string | string[] | null;
  note: string | null;
  features: string | null;
  syllabusId?: string | null;
  requirementType?: string | null;
};

type CourseRecord = NewCourse;
type ExistingCourseRow = typeof courses.$inferSelect;

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
  return normalizeCompact(value)
    .replace(/[<＜][^>＞]+[>＞]/g, "")
    .replace(/※/g, "");
}

function toArray<T>(value: T | T[] | null | undefined): T[] | null {
  if (value == null) return null;
  return Array.isArray(value) ? value : [value];
}

function normalizeRawCourse(raw: RawCourse, year: number, semester: Semester): CourseRecord {
  return {
    syllabusId: raw.syllabusId ?? null,
    requirementType:
      raw.requirementType && isRequirement(raw.requirementType)
        ? raw.requirementType
        : null,
    name: raw.course,
    day: raw.day && isDayOfWeek(raw.day) ? raw.day : null,
    periods: toArray(raw.period),
    category: raw.category,
    grades: toArray(raw.grade),
    className: raw.class,
    classroom: raw.classroom,
    credits: raw.credits,
    instructors: toArray(raw.instructor),
    note: raw.note,
    features: raw.features && isFeature(raw.features) ? raw.features : null,
    academicYear: year,
    semester,
    department: "情報学部",
  };
}

function courseShapeFromRow(row: ExistingCourseRow): CourseRecord {
  return {
    syllabusId: row.syllabusId,
    requirementType: row.requirementType,
    name: row.name,
    day: row.day,
    periods: row.periods,
    category: row.category,
    grades: row.grades,
    className: row.className,
    classroom: row.classroom,
    credits: row.credits,
    instructors: row.instructors,
    note: row.note,
    features: row.features,
    academicYear: row.academicYear,
    semester: row.semester,
    department: row.department,
  };
}

function fullKey(course: CourseRecord): string {
  return JSON.stringify([
    course.syllabusId ?? null,
    course.requirementType ?? null,
    course.name,
    course.day ?? null,
    course.periods ?? null,
    course.category,
    course.grades ?? null,
    course.className ?? null,
    course.classroom ?? null,
    course.credits,
    course.instructors ?? null,
    course.note ?? null,
    course.features ?? null,
    course.academicYear,
    course.semester,
    course.department,
  ]);
}

function identityKey(course: CourseRecord): string {
  return JSON.stringify([
    course.name,
    course.day ?? null,
    course.periods ?? null,
    course.category,
    course.grades ?? null,
    course.className ?? null,
    course.credits,
    course.instructors ?? null,
    course.academicYear,
    course.semester,
    course.department,
  ]);
}

function normalizedIdentityKey(course: CourseRecord): string {
  return JSON.stringify([
    normalizeCourseName(course.name),
    normalizeCompact(course.day),
    course.periods ?? null,
    normalizeCompact(course.category),
    course.grades ?? null,
    normalizeCompact(course.className),
    course.credits,
    course.instructors?.map((value) => normalizeCompact(value)) ?? null,
    course.academicYear,
    normalizeCompact(course.semester),
    normalizeCompact(course.department),
  ]);
}

function pushGroupedValue<T>(map: Map<string, T[]>, key: string, value: T): void {
  const existing = map.get(key);
  if (existing) {
    existing.push(value);
    return;
  }
  map.set(key, [value]);
}

function takeFirstGroupedValue<T>(map: Map<string, T[]>, key: string): T | null {
  const existing = map.get(key);
  if (!existing || existing.length === 0) return null;
  const value = existing.shift() ?? null;
  if (existing.length === 0) {
    map.delete(key);
  }
  return value;
}

function removeGroupedValueByPredicate<T>(
  map: Map<string, T[]>,
  key: string,
  predicate: (value: T) => boolean
): void {
  const existing = map.get(key);
  if (!existing || existing.length === 0) return;

  const next = existing.filter((value) => !predicate(value));
  if (next.length === 0) {
    map.delete(key);
    return;
  }

  map.set(key, next);
}

function zipCourseDiffs(oldCourses: CourseRecord[], newCourses: CourseRecord[]) {
  const oldByIdentity = new Map<string, CourseRecord[]>();
  const newByIdentity = new Map<string, CourseRecord[]>();

  for (const course of oldCourses) {
    pushGroupedValue(oldByIdentity, identityKey(course), course);
  }
  for (const course of newCourses) {
    pushGroupedValue(newByIdentity, identityKey(course), course);
  }

  const identities = new Set<string>([
    ...oldByIdentity.keys(),
    ...newByIdentity.keys(),
  ]);

  const updates: Array<{ previous: CourseRecord; next: CourseRecord }> = [];
  const inserts: CourseRecord[] = [];
  const deletes: CourseRecord[] = [];

  for (const key of identities) {
    const previousGroup = oldByIdentity.get(key) ?? [];
    const nextGroup = newByIdentity.get(key) ?? [];
    const pairCount = Math.min(previousGroup.length, nextGroup.length);

    for (let index = 0; index < pairCount; index += 1) {
      if (fullKey(previousGroup[index]) !== fullKey(nextGroup[index])) {
        updates.push({ previous: previousGroup[index], next: nextGroup[index] });
      }
    }

    if (previousGroup.length > pairCount) {
      deletes.push(...previousGroup.slice(pairCount));
    }
    if (nextGroup.length > pairCount) {
      inserts.push(...nextGroup.slice(pairCount));
    }
  }

  return { updates, inserts, deletes };
}

async function main() {
  const args = process.argv.slice(2);
  let year = 2026;
  let semester: Semester = "前期";
  let previousFilePath = "";
  let nextFilePath = "";
  let dryRun = false;

  if (args.includes("--help") || args.includes("-h")) {
    console.log(
      "Usage: tsx scripts/import-courses-diff.ts --previous <json-path> --next <json-path> [--year <yyyy>] [--semester <前期|後期>] [--dry-run]"
    );
    return;
  }

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--year" && args[index + 1]) {
      year = parseInt(args[index + 1], 10);
      index += 1;
    } else if (args[index] === "--semester" && args[index + 1]) {
      semester = args[index + 1] as Semester;
      index += 1;
    } else if (args[index] === "--previous" && args[index + 1]) {
      previousFilePath = resolve(args[index + 1]);
      index += 1;
    } else if (args[index] === "--next" && args[index + 1]) {
      nextFilePath = resolve(args[index + 1]);
      index += 1;
    } else if (args[index] === "--dry-run") {
      dryRun = true;
    }
  }

  if (!previousFilePath || !nextFilePath) {
    console.error(
      "Usage: tsx scripts/import-courses-diff.ts --previous <json-path> --next <json-path> [--year <yyyy>] [--semester <前期|後期>] [--dry-run]"
    );
    process.exit(1);
  }

  console.log(`Diff importing courses: year=${year}, semester=${semester}${dryRun ? " (dry-run)" : ""}`);
  console.log(`Previous file: ${previousFilePath}`);
  console.log(`Next file: ${nextFilePath}`);

  const previousRaw = JSON.parse(readFileSync(previousFilePath, "utf-8")) as RawCourse[];
  const nextRaw = JSON.parse(readFileSync(nextFilePath, "utf-8")) as RawCourse[];
  const previousCourses = previousRaw.map((course) => normalizeRawCourse(course, year, semester));
  const nextCourses = nextRaw.map((course) => normalizeRawCourse(course, year, semester));

  const { updates, inserts, deletes } = zipCourseDiffs(previousCourses, nextCourses);

  console.log(`Planned updates: ${updates.length}`);
  console.log(`Planned inserts: ${inserts.length}`);
  console.log(`Planned deletes: ${deletes.length}`);

  if (dryRun) {
    return;
  }

  const existingRows = await db
    .select()
    .from(courses)
    .where(
      and(
        eq(courses.academicYear, year),
        eq(courses.semester, semester),
        eq(courses.department, "情報学部")
      )
    );

  const rowsByFullKey = new Map<string, ExistingCourseRow[]>();
  const rowsByNormalizedIdentity = new Map<string, ExistingCourseRow[]>();
  for (const row of existingRows) {
    const shape = courseShapeFromRow(row);
    pushGroupedValue(rowsByFullKey, fullKey(shape), row);
    pushGroupedValue(rowsByNormalizedIdentity, normalizedIdentityKey(shape), row);
  }

  const claimExistingRow = (course: CourseRecord): ExistingCourseRow | null => {
    const exact = takeFirstGroupedValue(rowsByFullKey, fullKey(course));
    if (exact) {
      removeGroupedValueByPredicate(
        rowsByNormalizedIdentity,
        normalizedIdentityKey(courseShapeFromRow(exact)),
        (row) => row.id === exact.id
      );
      return exact;
    }

    const relaxed = takeFirstGroupedValue(
      rowsByNormalizedIdentity,
      normalizedIdentityKey(course)
    );
    if (relaxed) {
      removeGroupedValueByPredicate(
        rowsByFullKey,
        fullKey(courseShapeFromRow(relaxed)),
        (row) => row.id === relaxed.id
      );
      return relaxed;
    }

    return null;
  };

  let appliedUpdates = 0;
  let appliedInserts = 0;
  let appliedDeletes = 0;

  for (const update of updates) {
    const existingRow = claimExistingRow(update.previous);
    if (!existingRow) {
      throw new Error(`No matching DB row found for update target: ${update.previous.name}`);
    }

    await db
      .update(courses)
      .set(update.next)
      .where(eq(courses.id, existingRow.id));

    appliedUpdates += 1;
  }

  for (const toDelete of deletes) {
    const existingRow = claimExistingRow(toDelete);
    if (!existingRow) {
      throw new Error(`No matching DB row found for delete target: ${toDelete.name}`);
    }

    await db.delete(courses).where(eq(courses.id, existingRow.id));
    appliedDeletes += 1;
  }

  if (inserts.length > 0) {
    const inserted = await db.insert(courses).values(inserts).returning({ id: courses.id });
    appliedInserts = inserted.length;
  }

  console.log(`Applied updates: ${appliedUpdates}`);
  console.log(`Applied inserts: ${appliedInserts}`);
  console.log(`Applied deletes: ${appliedDeletes}`);
}

main().catch((error) => {
  console.error("Diff import failed:", error);
  process.exit(1);
});