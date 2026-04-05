import { NextResponse } from "next/server";
import { fromSemesterQueryValue } from "@/lib/academic-term";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { userCourses } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getUserTimetable } from "@/server/timetable";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const semester = fromSemesterQueryValue(searchParams.get("semester"));
  const academicYear = searchParams.get("academicYear");

  try {
    const result = await getUserTimetable(session.user.id, {
      semester: semester ?? undefined,
      academicYear: academicYear ? parseInt(academicYear, 10) : undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching timetable:", error);
    return NextResponse.json(
      { error: "Failed to fetch timetable" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { courseId } = (await request.json()) as { courseId: string };

    if (!courseId || typeof courseId !== "string") {
      return NextResponse.json(
        { error: "Course ID required" },
        { status: 400 }
      );
    }

    await db
      .insert(userCourses)
      .values({
        userId: session.user.id,
        courseId,
      })
      .onConflictDoNothing();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error adding to timetable:", error);
    return NextResponse.json(
      { error: "Failed to add to timetable" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { courseId } = (await request.json()) as { courseId: string };

    if (!courseId || typeof courseId !== "string") {
      return NextResponse.json(
        { error: "Course ID required" },
        { status: 400 }
      );
    }

    await db
      .delete(userCourses)
      .where(
        and(
          eq(userCourses.userId, session.user.id),
          eq(userCourses.courseId, courseId)
        )
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing from timetable:", error);
    return NextResponse.json(
      { error: "Failed to remove from timetable" },
      { status: 500 }
    );
  }
}
