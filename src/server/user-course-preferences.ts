import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  userCoursePreferences,
  type UserCoursePreferencesRecord,
} from "@/lib/db/schema";
import {
  createDefaultUserCoursePreferences,
  sanitizeUserCoursePreferences,
  type UserCoursePreferences,
} from "@/lib/user-course-preferences";

function mapRecordToPreferences(
  record: UserCoursePreferencesRecord | undefined,
  fallbackEmail?: string | null
) {
  if (!record) {
    return createDefaultUserCoursePreferences(fallbackEmail);
  }

  return sanitizeUserCoursePreferences(
    {
      studentEmail: record.studentEmail,
      gradeMode: record.gradeMode,
      manualGrade: record.manualGrade,
      classMode: record.classMode,
      manualClass: record.manualClass,
      selectedCourse: record.selectedCourse,
    },
    fallbackEmail
  );
}

export async function getUserCoursePreferences(
  userId: string,
  fallbackEmail?: string | null
) {
  try {
    const [record] = await db
      .select()
      .from(userCoursePreferences)
      .where(eq(userCoursePreferences.userId, userId))
      .limit(1);

    return mapRecordToPreferences(record, fallbackEmail);
  } catch (error) {
    console.error("Failed to load user course preferences:", error);
    return createDefaultUserCoursePreferences(fallbackEmail);
  }
}

export async function saveUserCoursePreferences(
  userId: string,
  preferencesInput: unknown,
  fallbackEmail?: string | null
) {
  const preferences = sanitizeUserCoursePreferences(preferencesInput, fallbackEmail);

  await db
    .insert(userCoursePreferences)
    .values({
      userId,
      studentEmail: preferences.studentEmail,
      gradeMode: preferences.gradeMode,
      manualGrade: preferences.manualGrade,
      classMode: preferences.classMode,
      manualClass: preferences.manualClass,
      selectedCourse: preferences.selectedCourse,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userCoursePreferences.userId,
      set: {
        studentEmail: preferences.studentEmail,
        gradeMode: preferences.gradeMode,
        manualGrade: preferences.manualGrade,
        classMode: preferences.classMode,
        manualClass: preferences.manualClass,
        selectedCourse: preferences.selectedCourse,
        updatedAt: new Date(),
      },
    });

  return preferences satisfies UserCoursePreferences;
}