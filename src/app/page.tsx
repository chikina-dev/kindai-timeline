import { auth } from "@/lib/auth";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { TimetablePage } from "@/components/timetable/timetable-page";
import { TimeTableProvider } from "@/components/timetable/timetable-provider";
import { getTimeTablePageInitialData } from "@/server/timetable-page-data";
import { getUserCoursePreferences } from "@/server/user-course-preferences";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ academicYear?: string; semester?: string }>;
}) {
  await connection();

  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  const { academicYear, semester } = await searchParams;
  const {
    initialAcademicYear,
    availableAcademicYears,
    initialSemester,
    initialTimetable,
    initialCourseAvailabilityCounts,
    warningMessage,
    swrFallback,
  } = await getTimeTablePageInitialData({
    userId: session.user.id,
    requestedAcademicYear: academicYear,
    requestedSemester: semester,
  });
  const initialUserCoursePreferences = await getUserCoursePreferences(
    session.user.id,
    session.user.email ?? null
  );

  return (
    <TimeTableProvider
      fallback={swrFallback}
      initialAcademicYear={initialAcademicYear}
      availableAcademicYears={availableAcademicYears}
      initialSemester={initialSemester}
      warningMessage={warningMessage}
      initialUserCoursePreferences={initialUserCoursePreferences}
    >
      <TimetablePage
        session={session}
        initialAcademicYear={initialAcademicYear}
        initialSemester={initialSemester}
        initialTimetable={initialTimetable}
        initialCourseAvailabilityCounts={initialCourseAvailabilityCounts}
      />
    </TimeTableProvider>
  );
}
