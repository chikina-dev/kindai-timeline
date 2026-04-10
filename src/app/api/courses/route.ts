import { NextResponse } from "next/server";
import { fromSemesterQueryValue } from "@/lib/academic-term";
import { auth } from "@/lib/auth";
import { getCourses } from "@/server/courses";
import { isCategory, isDayOfWeek, type Category, type DayOfWeek } from "@/types/course-domain";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dayParam = searchParams.get("day");
  const period = searchParams.get("period");
  const categoryParam = searchParams.get("category");
  const semester = fromSemesterQueryValue(searchParams.get("semester"));
  const academicYearParam = searchParams.get("academicYear");
  const ondemand = searchParams.get("ondemand");
  const day: DayOfWeek | null =
    dayParam && isDayOfWeek(dayParam) ? dayParam : null;
  const category: Category | null =
    categoryParam && isCategory(categoryParam) ? categoryParam : null;
  const academicYear = academicYearParam
    ? Number.parseInt(academicYearParam, 10)
    : Number.NaN;

  try {
    const result = await getCourses({
      day: day ?? undefined,
      period: period ? Number.parseInt(period, 10) : undefined,
      category: category ?? undefined,
      semester: semester ?? undefined,
      academicYear: Number.isInteger(academicYear) ? academicYear : undefined,
      ondemand: ondemand === "true",
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching courses:", error);
    return NextResponse.json(
      { error: "Failed to fetch courses" },
      { status: 500 }
    );
  }
}
