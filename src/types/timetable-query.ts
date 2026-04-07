import type { UserCoursePreferences } from "@/lib/user-course-preferences";
import type { AcademicCalendarSession, Course } from "@/types/course-records";
import type { DayOfWeek, Semester } from "@/types/course-domain";

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

export type TimetableSnapshot = {
  academicYear: number;
  semester: Semester;
  timetable: Course[];
  courseAvailabilityCounts: CourseAvailabilityCounts;
  userCoursePreferences: UserCoursePreferences;
  warningMessage?: string;
};

export type TimetableSwrFallbackValue =
  | Course[]
  | CourseAvailabilityCounts
  | TimetableSnapshot
  | AcademicCalendarSession[];

export type TimetableSwrFallback = Record<string, TimetableSwrFallbackValue>;

export type TimetablePageInitialData = {
  initialAcademicYear: number;
  availableAcademicYears: number[];
  initialSemester: Semester;
  initialSnapshot: TimetableSnapshot;
  warningMessage?: string;
  swrFallback: TimetableSwrFallback;
};