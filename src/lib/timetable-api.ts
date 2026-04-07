import { toSemesterQueryValue } from "@/lib/academic-term";
import type { TimetableQueryFilters } from "@/types/timetable-data";

export const TIMETABLE_ENDPOINT = "/api/timetable";
export const TIMETABLE_PAGE_DATA_ENDPOINT = "/api/page-data";

export function buildTimetableApiUrl(
  basePath = TIMETABLE_ENDPOINT,
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

export function buildTimetablePageDataApiUrl(
  basePath = TIMETABLE_PAGE_DATA_ENDPOINT,
  filters?: TimetableQueryFilters
) {
  return buildTimetableApiUrl(basePath, filters);
}