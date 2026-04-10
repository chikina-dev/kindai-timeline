import type {
  AcademicCalendarSession,
  Course as DbCourse,
  CourseLegacyName as DbCourseLegacyName,
  NewAcademicCalendarSession,
  NewCourse,
  UserCourse,
  UserCoursePreferencesRecord,
} from "@/lib/db/schema";

export type CourseLegacyName = Pick<
  DbCourseLegacyName,
  "legacyAcademicYear" | "legacyName"
>;

export type Course = DbCourse & {
  legacyNames: CourseLegacyName[];
};

export type {
  AcademicCalendarSession,
  NewAcademicCalendarSession,
  NewCourse,
  UserCourse,
  UserCoursePreferencesRecord,
};