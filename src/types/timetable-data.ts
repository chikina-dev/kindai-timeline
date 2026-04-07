import type { DayOfWeek } from "@/types/timetable";
import type { AcademicCalendarSession, Course, Semester } from "@/types/timetable";

export type AcademicTermFilters = {
  semester?: Semester;
  academicYear?: number;
};

export type TimetableQueryFilters = AcademicTermFilters;

export type CourseAvailabilityQueryFilters = AcademicTermFilters;

export type CourseSlotKey = `${DayOfWeek}-${number}`;

export type CourseAvailabilityCounts = {
  slotCounts: Partial<Record<CourseSlotKey, number>>;
  ondemandCount: number;
};

export type AcademicCalendarSessionFilters = AcademicTermFilters;

export type TimetableSwrFallbackValue =
  | Course[]
  | CourseAvailabilityCounts
  | AcademicCalendarSession[];

export type TimetableSwrFallback = Record<string, TimetableSwrFallbackValue>;

export type TimetablePageInitialData = {
  initialAcademicYear: number;
  availableAcademicYears: number[];
  initialSemester: Semester;
  initialTimetable: Course[];
  initialCourseAvailabilityCounts: CourseAvailabilityCounts;
  warningMessage?: string;
  swrFallback: TimetableSwrFallback;
};