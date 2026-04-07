import { auth } from "@/lib/auth";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { TimetablePage } from "@/components/timetable/timetable-page";
import { TimeTableProvider } from "@/components/timetable/timetable-provider";
import { getTimeTablePageInitialData } from "@/server/timetable-page-data";

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
    swrFallback,
  } = await getTimeTablePageInitialData({
    userId: session.user.id,
    fallbackEmail: session.user.email ?? null,
    requestedAcademicYear: academicYear,
    requestedSemester: semester,
  });

  return (
    <TimeTableProvider
      fallback={swrFallback}
      initialAcademicYear={initialAcademicYear}
      availableAcademicYears={availableAcademicYears}
      initialSemester={initialSemester}
    >
      <TimetablePage session={session} />
    </TimeTableProvider>
  );
}
