import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sanitizeUserCoursePreferences } from "@/lib/user-course-preferences";
import {
  getUserCoursePreferences,
  saveUserCoursePreferences,
} from "@/server/user-course-preferences";

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const preferences = await getUserCoursePreferences(
    session.user.id,
    session.user.email ?? null
  );

  return NextResponse.json(preferences);
}

export async function PUT(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = sanitizeUserCoursePreferences(
      await request.json(),
      session.user.email ?? null
    );
    const preferences = await saveUserCoursePreferences(
      session.user.id,
      payload,
      session.user.email ?? null
    );

    return NextResponse.json(preferences);
  } catch (error) {
    console.error("Failed to save user course preferences:", error);
    return NextResponse.json(
      { error: "Failed to save user course preferences" },
      { status: 500 }
    );
  }
}