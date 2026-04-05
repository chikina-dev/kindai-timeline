

import { readFileSync } from "fs";
import { resolve } from "path";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { eq, and } from "drizzle-orm";
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

function toArray<T>(value: T | T[] | null | undefined): T[] | null {
  if (value == null) return null;
  return Array.isArray(value) ? value : [value];
}

async function main() {
  const args = process.argv.slice(2);
  let year = 2026;
  let semester: Semester = "前期";
  let filePath = resolve(__dirname, "../data/test.json");

  if (args.includes("--help") || args.includes("-h")) {
    console.log(
      "Usage: tsx scripts/import-courses.ts --file <json-path> [--year <yyyy>] [--semester <前期|後期>]"
    );
    return;
  }

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year" && args[i + 1]) {
      year = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === "--semester" && args[i + 1]) {
      semester = args[i + 1] as Semester;
      i++;
    } else if (args[i] === "--file" && args[i + 1]) {
      filePath = resolve(args[i + 1]);
      i++;
    }
  }

  console.log(`Importing courses: year=${year}, semester=${semester}`);
  console.log(`File: ${filePath}`);

  const raw = JSON.parse(readFileSync(filePath, "utf-8")) as RawCourse[];
  console.log(`Found ${raw.length} courses in JSON`);

  const records: NewCourse[] = raw.map((r) => ({
    syllabusId: r.syllabusId ?? null,
    requirementType:
      r.requirementType && isRequirement(r.requirementType)
        ? r.requirementType
        : null,
    name: r.course,
    day: r.day && isDayOfWeek(r.day) ? r.day : null,
    periods: toArray(r.period),
    category: r.category,
    grades: toArray(r.grade),
    className: r.class,
    classroom: r.classroom,
    credits: r.credits,
    instructors: toArray(r.instructor),
    note: r.note,
    features: r.features && isFeature(r.features) ? r.features : null,
    academicYear: year,
    semester,
    department: "情報学部",
  }));

  // Clear existing courses for this year/semester/department before inserting
  const deleted = await db
    .delete(courses)
    .where(
      and(
        eq(courses.academicYear, year),
        eq(courses.semester, semester),
        eq(courses.department, "情報学部")
      )
    )
    .returning({ id: courses.id });
  console.log(`Deleted ${deleted.length} existing courses`);

  const result = await db.insert(courses).values(records).returning({ id: courses.id });
  console.log(`Inserted ${result.length} courses`);
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
