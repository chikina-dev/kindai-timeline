import useSWR from "swr";
import { buildAcademicCalendarApiUrl } from "@/lib/academic-calendar";
import {
  buildCourseAvailabilityApiUrl,
} from "@/lib/course-availability";
import { toSemesterQueryValue } from "@/lib/academic-term";
import {
  buildTimetablePageDataApiUrl,
  TIMETABLE_PAGE_DATA_ENDPOINT,
} from "@/lib/timetable-api";
import type { AcademicCalendarSession, Course, Semester } from "@/types/timetable";
import type {
  AcademicCalendarSessionFilters,
  CourseAvailabilityCounts,
  CourseAvailabilityQueryFilters,
  TimetableQueryFilters,
  TimetableSnapshot,
} from "@/types/timetable-data";

const fetcher = async (url: string): Promise<Course[]> => {
  const res = await fetch(url);
  return res.json() as Promise<Course[]>;
};

const courseAvailabilityFetcher = async (url: string): Promise<CourseAvailabilityCounts> => {
  const res = await fetch(url);
  return res.json() as Promise<CourseAvailabilityCounts>;
};

const academicCalendarFetcher = async (
  url: string
): Promise<AcademicCalendarSession[]> => {
  const res = await fetch(url);
  return res.json() as Promise<AcademicCalendarSession[]>;
};

const timetableSnapshotFetcher = async (
  url: string
): Promise<TimetableSnapshot> => {
  const res = await fetch(url);
  return res.json() as Promise<TimetableSnapshot>;
};

type SwrHookOptions = {
  enabled?: boolean;
};

type CourseQueryFilters = {
  day?: string;
  period?: number;
  category?: string;
  semester?: Semester;
  academicYear?: number;
  ondemand?: boolean;
};

function buildCoursesUrl(basePath: string, filters?: CourseQueryFilters) {
  const params = new URLSearchParams();

  if (filters?.ondemand) {
    params.set("ondemand", "true");
  } else {
    if (filters?.day) params.set("day", filters.day);
    if (filters?.period) params.set("period", String(filters.period));
  }

  if (filters?.category) params.set("category", filters.category);
  if (filters?.semester) {
    params.set("semester", toSemesterQueryValue(filters.semester));
  }
  if (filters?.academicYear) {
    params.set("academicYear", String(filters.academicYear));
  }

  const queryString = params.toString();
  return `${basePath}${queryString ? `?${queryString}` : ""}`;
}

export function useCourses(
  filters?: CourseQueryFilters,
  options?: SwrHookOptions
) {
  const url = buildCoursesUrl("/api/courses", filters);
  const key = options?.enabled === false ? null : url;

  return useSWR<Course[]>(key, fetcher);
}

export function useCourseAvailabilityCounts(
  filters?: CourseAvailabilityQueryFilters,
  options?: SwrHookOptions
) {
  const url = buildCourseAvailabilityApiUrl("/api/courses/counts", filters);
  const key = options?.enabled === false ? null : url;

  return useSWR<CourseAvailabilityCounts>(key, courseAvailabilityFetcher, {
    revalidateIfStale: false,
  });
}

export function useTimetableSnapshot(
  filters?: TimetableQueryFilters,
  options?: SwrHookOptions
) {
  const url = buildTimetablePageDataApiUrl(TIMETABLE_PAGE_DATA_ENDPOINT, filters);
  const key = options?.enabled === false ? null : url;

  return useSWR<TimetableSnapshot>(key, timetableSnapshotFetcher, {
    revalidateIfStale: false,
  });
}

export function useAcademicCalendarSessions(
  filters?: AcademicCalendarSessionFilters,
  options?: SwrHookOptions
) {
  const url = buildAcademicCalendarApiUrl("/api/academic-calendar", filters);
  const key = options?.enabled === false ? null : url;

  return useSWR<AcademicCalendarSession[]>(key, academicCalendarFetcher, {
    revalidateIfStale: false,
  });
}
