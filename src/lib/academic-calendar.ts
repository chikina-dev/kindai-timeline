import { toSemesterQueryValue } from "@/lib/academic-term";
import type { AcademicCalendarSessionFilters } from "@/types/timetable-query";

export function buildAcademicCalendarApiUrl(
  basePath = "/api/academic-calendar",
  filters?: AcademicCalendarSessionFilters
) {
  const params = new URLSearchParams();

  if (filters?.semester) {
    params.set("semester", toSemesterQueryValue(filters.semester));
  }

  if (filters?.academicYear) {
    params.set("academicYear", String(filters.academicYear));
  }

  const queryString = params.toString();
  return `${basePath}${queryString ? `?${queryString}` : ""}`;
}