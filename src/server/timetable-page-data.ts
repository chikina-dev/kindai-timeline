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
import { buildTimetableApiUrl } from "@/lib/timetable-api";
import { getCourseAvailabilityCounts } from "@/server/course-availability";
import { getUserTimetable } from "@/server/timetable";
import type { Course, Semester } from "@/types/timetable";
import type {
  CourseAvailabilityCounts,
  TimetablePageInitialData,
  TimetableSwrFallback,
} from "@/types/timetable-data";

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

function buildTimetableSwrFallback(
  initialAcademicYear: number,
  initialSemester: Semester,
  initialTimetable: Course[],
  initialCourseAvailabilityCounts: CourseAvailabilityCounts
): TimetableSwrFallback {
  return {
    [buildTimetableApiUrl("/api/timetable", {
      academicYear: initialAcademicYear,
      semester: initialSemester,
    })]: initialTimetable,
    [buildCourseAvailabilityApiUrl("/api/courses/counts", {
      academicYear: initialAcademicYear,
      semester: initialSemester,
    })]: initialCourseAvailabilityCounts,
  };
}

export async function getTimeTablePageInitialData(input: {
  userId: string;
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
  const {
    initialTimetable,
    initialCourseAvailabilityCounts,
    warningMessage: initialDataWarningMessage,
  } = await loadInitialTimetableData(
    input.userId,
    initialAcademicYear,
    initialSemester
  );

  return {
    initialAcademicYear,
    availableAcademicYears,
    initialSemester,
    initialTimetable,
    initialCourseAvailabilityCounts,
    warningMessage:
      academicYearsWarningMessage ?? initialDataWarningMessage,
    swrFallback: buildTimetableSwrFallback(
      initialAcademicYear,
      initialSemester,
      initialTimetable,
      initialCourseAvailabilityCounts
    ),
  };
}