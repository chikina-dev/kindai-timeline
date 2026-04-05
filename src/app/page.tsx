import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { TimetablePage } from "@/components/timetable/timetable-page";
import { TimeTableProvider } from "@/components/timetable/timetable-provider";
import { getTimeTablePageInitialData } from "@/server/timetable-page-data";

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
  const {
    initialAcademicYear,
    availableAcademicYears,
    initialSemester,
    warningMessage,
    swrFallback,
  } = await getTimeTablePageInitialData({
    userId: session.user.id,
    requestedAcademicYear: academicYear,
    requestedSemester: semester,
  });

  return (
    <TimeTableProvider
      fallback={swrFallback}
      initialAcademicYear={initialAcademicYear}
      availableAcademicYears={availableAcademicYears}
      initialSemester={initialSemester}
      warningMessage={warningMessage}
    >
      <TimetablePage session={session} />
    </TimeTableProvider>
  );
}
