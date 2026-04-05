import { NextResponse } from "next/server";
import { fromSemesterQueryValue } from "@/lib/academic-term";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { courses } from "@/lib/db/schema";
import { eq, and, sql, isNull } from "drizzle-orm";
import { isCategory, isDayOfWeek } from "@/types/timetable";

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
  const day = dayParam && isDayOfWeek(dayParam) ? dayParam : null;
  const category = categoryParam && isCategory(categoryParam) ? categoryParam : null;
  const academicYear = academicYearParam
    ? Number.parseInt(academicYearParam, 10)
    : Number.NaN;

  const conditions = [];

  if (ondemand === "true") {
    conditions.push(isNull(courses.day));
  } else {
    if (day) {
      conditions.push(eq(courses.day, day));
    }

    if (period) {
      conditions.push(sql`${parseInt(period)} = ANY(${courses.periods})`);
    }
  }

  if (category) {
    conditions.push(eq(courses.category, category));
  }

  if (semester) {
    conditions.push(eq(courses.semester, semester));
  }

  if (Number.isInteger(academicYear)) {
    conditions.push(eq(courses.academicYear, academicYear));
  }

  try {
    const result = await db
      .select()
      .from(courses)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(courses.day, courses.name);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching courses:", error);
    return NextResponse.json(
      { error: "Failed to fetch courses" },
      { status: 500 }
    );
  }
}
