export const USER_COURSE_OPTIONS = ["実世界", "サイバー", "知能"] as const;
export const USER_CLASS_OPTIONS = ["A", "B"] as const;
export const USER_PROFILE_GRADE_OPTIONS = [1, 2, 3, 4, 5, 6] as const;

export type UserCourseOption = (typeof USER_COURSE_OPTIONS)[number];
export type UserClassOption = (typeof USER_CLASS_OPTIONS)[number];
export type UserProfileMode = "auto" | "manual";

export type UserCoursePreferences = {
  studentEmail: string;
  gradeMode: UserProfileMode;
  manualGrade: number | null;
  classMode: UserProfileMode;
  manualClass: UserClassOption | null;
  selectedCourse: UserCourseOption | null;
};

export type ResolvedUserCourseProfile = {
  admissionYear: number | null;
  serialNumber: number | null;
  resolvedGrade: number | null;
  resolvedClass: UserClassOption | null;
  selectedCourse: UserCourseOption | null;
  defaultSelectedGrades: number[];
  defaultSelectedClasses: string[];
};

const CLASS_DIVISION_BOUNDARIES: Record<number, number> = {
  2022: 205,
  2023: 182,
  2024: 202,
  2025: 232,
  2026: 204,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isUserProfileMode(value: unknown): value is UserProfileMode {
  return value === "auto" || value === "manual";
}

function isUserClassOption(value: unknown): value is UserClassOption {
  return USER_CLASS_OPTIONS.some((option) => option === value);
}

function isUserCourseOption(value: unknown): value is UserCourseOption {
  return USER_COURSE_OPTIONS.some((option) => option === value);
}

function normalizeManualGrade(value: unknown) {
  return typeof value === "number" && USER_PROFILE_GRADE_OPTIONS.includes(value as 1)
    ? value
    : null;
}

export function createDefaultUserCoursePreferences(
  studentEmail?: string | null
) {
  return {
    studentEmail: studentEmail ?? "",
    gradeMode: "auto",
    manualGrade: null,
    classMode: "auto",
    manualClass: null,
    selectedCourse: null,
  } satisfies UserCoursePreferences;
}

export function sanitizeUserCoursePreferences(
  value: unknown,
  fallbackEmail?: string | null
) {
  const defaults = createDefaultUserCoursePreferences(fallbackEmail);

  if (!isRecord(value)) {
    return defaults;
  }

  return {
    studentEmail:
      typeof value.studentEmail === "string" && value.studentEmail.trim().length > 0
        ? value.studentEmail.trim()
        : defaults.studentEmail,
    gradeMode: isUserProfileMode(value.gradeMode) ? value.gradeMode : defaults.gradeMode,
    manualGrade: normalizeManualGrade(value.manualGrade),
    classMode: isUserProfileMode(value.classMode) ? value.classMode : defaults.classMode,
    manualClass: isUserClassOption(value.manualClass) ? value.manualClass : null,
    selectedCourse: isUserCourseOption(value.selectedCourse) ? value.selectedCourse : null,
  } satisfies UserCoursePreferences;
}

export function getUserCoursePreferencesStorageKey(studentEmail?: string | null) {
  return `kindai-timetable:user-course-preferences:${
    studentEmail?.toLowerCase() || "anonymous"
  }`;
}

export function parseKindaiStudentEmail(studentEmail: string) {
  const normalizedEmail = studentEmail.trim().toLowerCase();
  const localPart = normalizedEmail.split("@")[0] ?? "";
  const match = localPart.match(/^(\d{2})\d{4}(\d{4})[a-z]?$/i);

  if (!match) {
    return null;
  }

  return {
    admissionYear: 2000 + Number(match[1]),
    serialNumber: Number(match[2]),
  };
}

export function inferUserGrade(admissionYear: number, academicYear: number) {
  const grade = academicYear - admissionYear + 1;

  return grade >= 1 && grade <= 6 ? grade : null;
}

export function inferUserClass(
  admissionYear: number,
  serialNumber: number
): UserClassOption | null {
  const boundary = CLASS_DIVISION_BOUNDARIES[admissionYear];

  if (!boundary) {
    return null;
  }

  return serialNumber <= boundary ? "A" : "B";
}

export function resolveUserCourseProfile(
  preferences: UserCoursePreferences,
  academicYear: number
) {
  const parsedStudent = parseKindaiStudentEmail(preferences.studentEmail);
  const inferredGrade = parsedStudent
    ? inferUserGrade(parsedStudent.admissionYear, academicYear)
    : null;
  const inferredClass = parsedStudent
    ? inferUserClass(parsedStudent.admissionYear, parsedStudent.serialNumber)
    : null;
  const resolvedGrade =
    preferences.gradeMode === "manual" ? preferences.manualGrade : inferredGrade;
  const resolvedClass =
    preferences.classMode === "manual" ? preferences.manualClass : inferredClass;
  const shouldIncludeCourse = resolvedGrade === null || resolvedGrade >= 2;
  const defaultSelectedClasses: string[] = [];

  if (resolvedClass) {
    defaultSelectedClasses.push(resolvedClass);
  }

  if (shouldIncludeCourse && preferences.selectedCourse) {
    defaultSelectedClasses.push(preferences.selectedCourse);
  }

  return {
    admissionYear: parsedStudent?.admissionYear ?? null,
    serialNumber: parsedStudent?.serialNumber ?? null,
    resolvedGrade,
    resolvedClass,
    selectedCourse: preferences.selectedCourse,
    defaultSelectedGrades: resolvedGrade ? [resolvedGrade] : [],
    defaultSelectedClasses,
  } satisfies ResolvedUserCourseProfile;
}

export function formatResolvedUserCourseProfile(
  profile: ResolvedUserCourseProfile
) {
  const summaryParts = [
    profile.resolvedGrade ? `${profile.resolvedGrade}年` : null,
    profile.resolvedClass ? `${profile.resolvedClass}クラス` : null,
    profile.defaultSelectedClasses.includes(profile.selectedCourse ?? "")
      ? profile.selectedCourse
      : null,
  ].filter((value): value is string => Boolean(value));

  return summaryParts.length > 0 ? summaryParts.join(" / ") : "未設定";
}