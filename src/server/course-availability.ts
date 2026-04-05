import "server-only";

import { and, eq } from "drizzle-orm";
import { createCourseSlotKey } from "@/lib/course-availability";
import { db } from "@/lib/db";
import { courses } from "@/lib/db/schema";
import { isDayOfWeek, type DayOfWeek } from "@/types/timetable";
import type {
  CourseAvailabilityCounts,
  CourseAvailabilityQueryFilters,
} from "@/types/timetable-data";

export async function getCourseAvailabilityCounts(
  filters?: CourseAvailabilityQueryFilters
) {
  const conditions = [];

  if (filters?.semester) {
    conditions.push(eq(courses.semester, filters.semester));
  }

  if (filters?.academicYear) {
    conditions.push(eq(courses.academicYear, filters.academicYear));
  }

  const rows = await db
    .select({
      day: courses.day,
      periods: courses.periods,
    })
    .from(courses)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  const counts: CourseAvailabilityCounts = {
    slotCounts: {},
    ondemandCount: 0,
  };

  for (const row of rows) {
    if (!row.day) {
      counts.ondemandCount += 1;
      continue;
    }

    if (!isDayOfWeek(row.day) || !row.periods?.length) {
      continue;
    }

    for (const period of row.periods) {
      const slotKey = createCourseSlotKey(row.day as DayOfWeek, period);
      counts.slotCounts[slotKey] = (counts.slotCounts[slotKey] ?? 0) + 1;
    }
  }

  return counts;
}