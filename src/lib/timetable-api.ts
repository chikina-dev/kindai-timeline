import { toSemesterQueryValue } from "@/lib/academic-term";
import type { TimetableQueryFilters } from "@/types/timetable-data";

export function buildTimetableApiUrl(
  basePath = "/api/timetable",
  filters?: TimetableQueryFilters
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