import "server-only";

import { desc } from "drizzle-orm";
import {
  inferAcademicYear,
  inferSemester,
  resolveAcademicYear,
  resolveSemester,
} from "@/lib/academic-term";
import { buildCourseAvailabilityApiUrl } from "@/lib/course-availability";
import { db } from "@/lib/db";
import { courses } from "@/lib/db/schema";
import {
  buildTimetablePageDataApiUrl,
  buildTimetableApiUrl,
} from "@/lib/timetable-api";
import { getUserCoursePreferences } from "@/server/user-course-preferences";
import { getCourseAvailabilityCounts } from "@/server/course-availability";
import { getUserTimetable } from "@/server/timetable";
import type { Course } from "@/types/course-records";
import type { Semester } from "@/types/course-domain";
import type {
  CourseAvailabilityCounts,
  TimetablePageInitialData,
  TimetableSnapshot,
  TimetableSwrFallback,
} from "@/types/timetable-query";

const DATABASE_UNAVAILABLE_WARNING =
  "データベースに接続できないため、最新の時間割データを取得できませんでした。しばらくしてから再読み込みしてください。";

const EMPTY_COURSE_AVAILABILITY_COUNTS: CourseAvailabilityCounts = {
  slotCounts: {},
  ondemandCount: 0,
};

async function loadAvailableAcademicYears(fallbackAcademicYear: number) {
  try {
    const academicYearRows = await db
      .select({ academicYear: courses.academicYear })
      .from(courses)
      .orderBy(desc(courses.academicYear));

    const availableAcademicYears = Array.from(
      new Set(academicYearRows.map((row) => row.academicYear))
    );

    return {
      availableAcademicYears:
        availableAcademicYears.length > 0
          ? availableAcademicYears
          : [fallbackAcademicYear],
    };
  } catch (error) {
    console.error("Failed to load available academic years:", error);

    return {
      availableAcademicYears: [fallbackAcademicYear],
      warningMessage: DATABASE_UNAVAILABLE_WARNING,
    };
  }
}

async function loadInitialTimetableData(
  userId: string,
  academicYear: number,
  semester: Semester
) {
  try {
    const [initialTimetable, initialCourseAvailabilityCounts] = await Promise.all([
      getUserTimetable(userId, {
        academicYear,
        semester,
      }),
      getCourseAvailabilityCounts({
        academicYear,
        semester,
      }),
    ]);

    return {
      initialTimetable,
      initialCourseAvailabilityCounts,
    };
  } catch (error) {
    console.error("Failed to load initial timetable data:", error);

    return {
      initialTimetable: [] as Course[],
      initialCourseAvailabilityCounts: EMPTY_COURSE_AVAILABILITY_COUNTS,
      warningMessage: DATABASE_UNAVAILABLE_WARNING,
    };
  }
}

export async function getTimetableSnapshot(input: {
  userId: string;
  academicYear: number;
  semester: Semester;
  fallbackEmail?: string | null;
}): Promise<TimetableSnapshot> {
  const [snapshotData, userCoursePreferences] = await Promise.all([
    loadInitialTimetableData(input.userId, input.academicYear, input.semester),
    getUserCoursePreferences(input.userId, input.fallbackEmail),
  ]);

  return {
    academicYear: input.academicYear,
    semester: input.semester,
    timetable: snapshotData.initialTimetable,
    courseAvailabilityCounts: snapshotData.initialCourseAvailabilityCounts,
    userCoursePreferences,
    warningMessage: snapshotData.warningMessage,
  };
}

function buildTimetableSwrFallback(
  initialSnapshot: TimetableSnapshot
): TimetableSwrFallback {
  return {
    [buildTimetablePageDataApiUrl("/api/page-data", {
      academicYear: initialSnapshot.academicYear,
      semester: initialSnapshot.semester,
    })]: initialSnapshot,
    [buildTimetableApiUrl("/api/timetable", {
      academicYear: initialSnapshot.academicYear,
      semester: initialSnapshot.semester,
    })]: initialSnapshot.timetable,
    [buildCourseAvailabilityApiUrl("/api/courses/counts", {
      academicYear: initialSnapshot.academicYear,
      semester: initialSnapshot.semester,
    })]: initialSnapshot.courseAvailabilityCounts,
  };
}

export async function getTimeTablePageInitialData(input: {
  userId: string;
  fallbackEmail?: string | null;
  requestedAcademicYear?: string;
  requestedSemester?: string;
}): Promise<TimetablePageInitialData> {
  const inferredAcademicYear = inferAcademicYear(new Date());
  const {
    availableAcademicYears,
    warningMessage: academicYearsWarningMessage,
  } = await loadAvailableAcademicYears(inferredAcademicYear);
  const initialAcademicYear = resolveAcademicYear(
    input.requestedAcademicYear,
    availableAcademicYears,
    availableAcademicYears[0]
  );
  const initialSemester = resolveSemester(
    input.requestedSemester,
    inferSemester(new Date())
  );
  const initialSnapshot = await getTimetableSnapshot({
    userId: input.userId,
    academicYear: initialAcademicYear,
    semester: initialSemester,
    fallbackEmail: input.fallbackEmail,
  });

  return {
    initialAcademicYear,
    availableAcademicYears,
    initialSemester,
    initialSnapshot,
    warningMessage:
      academicYearsWarningMessage ?? initialSnapshot.warningMessage,
    swrFallback: buildTimetableSwrFallback(initialSnapshot),
  };
}