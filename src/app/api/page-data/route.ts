import { NextResponse } from "next/server";
import { fromSemesterQueryValue } from "@/lib/academic-term";
import { auth } from "@/lib/auth";
import { getTimetableSnapshot } from "@/server/timetable-page-data";

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const semester = fromSemesterQueryValue(searchParams.get("semester"));
  const academicYearParam = searchParams.get("academicYear");
  const academicYear = academicYearParam
    ? Number.parseInt(academicYearParam, 10)
    : Number.NaN;

  if (!semester || !Number.isInteger(academicYear)) {
    return NextResponse.json(
      { error: "Academic year and semester are required" },
      { status: 400 }
    );
  }

  try {
    const result = await getTimetableSnapshot({
      userId: session.user.id,
      academicYear,
      semester,
      fallbackEmail: session.user.email ?? null,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching timetable page data:", error);
    return NextResponse.json(
      { error: "Failed to fetch timetable page data" },
      { status: 500 }
    );
  }
}