import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { academicCalendarSessions } from "@/lib/db/schema";
import type { AcademicCalendarSessionFilters } from "@/types/timetable-data";

export async function getAcademicCalendarSessions(
  filters?: AcademicCalendarSessionFilters
) {
  const conditions = [];

  if (filters?.semester) {
    conditions.push(eq(academicCalendarSessions.semester, filters.semester));
  }

  if (filters?.academicYear) {
    conditions.push(eq(academicCalendarSessions.academicYear, filters.academicYear));
  }

  const query = db
    .select({
      id: academicCalendarSessions.id,
      academicYear: academicCalendarSessions.academicYear,
      semester: academicCalendarSessions.semester,
      actualDate: academicCalendarSessions.actualDate,
      actualDay: academicCalendarSessions.actualDay,
      effectiveDay: academicCalendarSessions.effectiveDay,
      lectureNumber: academicCalendarSessions.lectureNumber,
      rawLabel: academicCalendarSessions.rawLabel,
      createdAt: academicCalendarSessions.createdAt,
    })
    .from(academicCalendarSessions)
    .orderBy(asc(academicCalendarSessions.actualDate));

  if (conditions.length > 0) {
    return query.where(and(...conditions));
  }

  return query;
}