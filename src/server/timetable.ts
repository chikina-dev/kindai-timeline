import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { courses, userCourses } from "@/lib/db/schema";
import type { Course } from "@/types/course-records";
import type { TimetableQueryFilters } from "@/types/timetable-query";

export async function getUserTimetable(
  userId: string,
  filters?: TimetableQueryFilters
) {
  const conditions = [eq(userCourses.userId, userId)];

  if (filters?.semester) {
    conditions.push(eq(courses.semester, filters.semester));
  }

  if (filters?.academicYear) {
    conditions.push(eq(courses.academicYear, filters.academicYear));
  }

  const result = await db
    .select({
      id: courses.id,
      syllabusId: courses.syllabusId,
      requirementType: courses.requirementType,
      name: courses.name,
      day: courses.day,
      periods: courses.periods,
      category: courses.category,
      grades: courses.grades,
      className: courses.className,
      classroom: courses.classroom,
      credits: courses.credits,
      instructors: courses.instructors,
      note: courses.note,
      features: courses.features,
      academicYear: courses.academicYear,
      semester: courses.semester,
      department: courses.department,
      createdAt: courses.createdAt,
    })
    .from(userCourses)
    .innerJoin(courses, eq(userCourses.courseId, courses.id))
    .where(and(...conditions))
    .orderBy(courses.day, courses.name);

  return result satisfies Course[];
}