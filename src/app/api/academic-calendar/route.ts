import { NextResponse } from "next/server";
import { fromSemesterQueryValue } from "@/lib/academic-term";
import { auth } from "@/lib/auth";
import { getAcademicCalendarSessions } from "@/server/academic-calendar";

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

  try {
    const result = await getAcademicCalendarSessions({
      semester: semester ?? undefined,
      academicYear: Number.isInteger(academicYear) ? academicYear : undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching academic calendar sessions:", error);
    return NextResponse.json(
      { error: "Failed to fetch academic calendar sessions" },
      { status: 500 }
    );
  }
}