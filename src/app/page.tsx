import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { courses } from "@/lib/db/schema";
import {
  inferAcademicYear,
  inferSemester,
  resolveAcademicYear,
  resolveSemester,
} from "@/lib/academic-term";
import { desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { TimetablePage } from "@/components/timetable/timetable-page";
import { TimeTableProvider } from "@/components/timetable/timetable-provider";
import { buildCourseAvailabilityApiUrl } from "@/lib/course-availability";
import { buildTimetableApiUrl } from "@/lib/timetable-api";
import { getCourseAvailabilityCounts } from "@/server/course-availability";
import { getUserTimetable } from "@/server/timetable";
import type { Course, Semester } from "@/types/timetable";
import type {
  CourseAvailabilityCounts,
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

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ academicYear?: string; semester?: string }>;
}) {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  const { academicYear, semester } = await searchParams;

  const inferredAcademicYear = inferAcademicYear(new Date());
  const {
    availableAcademicYears: normalizedAcademicYears,
    warningMessage: academicYearsWarningMessage,
  } = await loadAvailableAcademicYears(inferredAcademicYear);
  const initialAcademicYear = resolveAcademicYear(
    academicYear,
    normalizedAcademicYears,
    normalizedAcademicYears[0]
  );
  const initialSemester = resolveSemester(semester, inferSemester(new Date()));
  const {
    initialTimetable,
    initialCourseAvailabilityCounts,
    warningMessage: initialDataWarningMessage,
  } = await loadInitialTimetableData(
    session.user.id,
    initialAcademicYear,
    initialSemester
  );
  const warningMessage =
    academicYearsWarningMessage ?? initialDataWarningMessage;

  const swrFallback: TimetableSwrFallback = {
    [buildTimetableApiUrl("/api/timetable", {
      academicYear: initialAcademicYear,
      semester: initialSemester,
    })]: initialTimetable,
    [buildCourseAvailabilityApiUrl("/api/courses/counts", {
      academicYear: initialAcademicYear,
      semester: initialSemester,
    })]: initialCourseAvailabilityCounts,
  };

  return (
    <TimeTableProvider
      fallback={swrFallback}
      initialAcademicYear={initialAcademicYear}
      availableAcademicYears={normalizedAcademicYears}
      initialSemester={initialSemester}
      warningMessage={warningMessage}
    >
      <TimetablePage session={session} />
    </TimeTableProvider>
  );
}
