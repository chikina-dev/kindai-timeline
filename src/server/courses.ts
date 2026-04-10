import "server-only";

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { courseLegacyNames, courses } from "@/lib/db/schema";
import type { Category, DayOfWeek, Semester } from "@/types/course-domain";
import type { Course } from "@/types/course-records";

type CourseRow = typeof courses.$inferSelect;

export type CourseListFilters = {
  day?: DayOfWeek;
  period?: number;
  category?: Category;
  semester?: Semester;
  academicYear?: number;
  ondemand?: boolean;
};

export function buildCourseListConditions(filters?: CourseListFilters) {
  const conditions = [];

  if (filters?.ondemand) {
    conditions.push(isNull(courses.day));
  } else {
    if (filters?.day) {
      conditions.push(eq(courses.day, filters.day));
    }

    if (typeof filters?.period === "number") {
      conditions.push(sql`${filters.period} = ANY(${courses.periods})`);
    }
  }

  if (filters?.category) {
    conditions.push(eq(courses.category, filters.category));
  }

  if (filters?.semester) {
    conditions.push(eq(courses.semester, filters.semester));
  }

  if (filters?.academicYear) {
    conditions.push(eq(courses.academicYear, filters.academicYear));
  }

  return conditions;
}

export async function attachLegacyNamesToCourses(
  courseRows: CourseRow[]
): Promise<Course[]> {
  if (courseRows.length === 0) {
    return [];
  }

  const courseIds = courseRows.map((course) => course.id);
  const legacyNameRows = await db
    .select({
      courseId: courseLegacyNames.courseId,
      legacyAcademicYear: courseLegacyNames.legacyAcademicYear,
      legacyName: courseLegacyNames.legacyName,
    })
    .from(courseLegacyNames)
    .where(inArray(courseLegacyNames.courseId, courseIds))
    .orderBy(
      asc(courseLegacyNames.courseId),
      desc(courseLegacyNames.legacyAcademicYear),
      asc(courseLegacyNames.legacyName)
    );

  const legacyNamesByCourseId = new Map<string, Course["legacyNames"]>();

  for (const row of legacyNameRows) {
    const currentRows = legacyNamesByCourseId.get(row.courseId) ?? [];
    currentRows.push({
      legacyAcademicYear: row.legacyAcademicYear,
      legacyName: row.legacyName,
    });
    legacyNamesByCourseId.set(row.courseId, currentRows);
  }

  return courseRows.map((course) => ({
    ...course,
    legacyNames: legacyNamesByCourseId.get(course.id) ?? [],
  }));
}

export async function getCourses(filters?: CourseListFilters): Promise<Course[]> {
  const conditions = buildCourseListConditions(filters);
  const courseRows = await db
    .select()
    .from(courses)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(courses.day, courses.name, courses.className);

  return attachLegacyNamesToCourses(courseRows);
}