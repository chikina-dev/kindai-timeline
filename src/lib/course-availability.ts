import { toSemesterQueryValue } from "@/lib/academic-term";
import type { DayOfWeek } from "@/types/timetable";
import type {
  CourseAvailabilityCounts,
  CourseAvailabilityQueryFilters,
  CourseSlotKey,
} from "@/types/timetable-data";

export function buildCourseAvailabilityApiUrl(
  basePath = "/api/courses/counts",
  filters?: CourseAvailabilityQueryFilters
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

export function createCourseSlotKey(day: DayOfWeek, period: number): CourseSlotKey {
  return `${day}-${period}`;
}

export function getCourseCountForSlot(
  counts: CourseAvailabilityCounts | undefined,
  day: DayOfWeek,
  period: number
) {
  return counts?.slotCounts[createCourseSlotKey(day, period)] ?? 0;
}