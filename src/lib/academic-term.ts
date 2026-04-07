import type { Semester } from "@/types/course-domain";

const VALID_SEMESTERS = new Set<Semester>(["前期", "後期"]);
const SEMESTER_QUERY_VALUE_MAP = {
  前期: "spring",
  後期: "fall",
} as const;
const QUERY_VALUE_SEMESTER_MAP = {
  spring: "前期",
  fall: "後期",
} as const;

export type SemesterQueryValue =
  (typeof SEMESTER_QUERY_VALUE_MAP)[keyof typeof SEMESTER_QUERY_VALUE_MAP];

export function inferAcademicYear(date: Date) {
  const month = date.getMonth() + 1;
  return month <= 3 ? date.getFullYear() - 1 : date.getFullYear();
}

export function inferSemester(date: Date): Semester {
  const month = date.getMonth() + 1;
  return month >= 4 && month <= 9 ? "前期" : "後期";
}

export function isSemester(value: string): value is Semester {
  return VALID_SEMESTERS.has(value as Semester);
}

export function isSemesterQueryValue(value: string): value is SemesterQueryValue {
  return value in QUERY_VALUE_SEMESTER_MAP;
}

export function toSemesterQueryValue(semester: Semester): SemesterQueryValue {
  return SEMESTER_QUERY_VALUE_MAP[semester];
}

export function fromSemesterQueryValue(
  value: string | null | undefined
): Semester | null {
  if (!value) {
    return null;
  }

  if (isSemesterQueryValue(value)) {
    return QUERY_VALUE_SEMESTER_MAP[value];
  }

  if (isSemester(value)) {
    return value;
  }

  return null;
}

export function resolveAcademicYear(
  requestedAcademicYear: string | null | undefined,
  availableAcademicYears: number[],
  fallbackAcademicYear: number
) {
  const parsedAcademicYear = Number.parseInt(requestedAcademicYear ?? "", 10);

  if (Number.isInteger(parsedAcademicYear)) {
    return availableAcademicYears.includes(parsedAcademicYear)
      ? parsedAcademicYear
      : fallbackAcademicYear;
  }

  return fallbackAcademicYear;
}

export function resolveSemester(
  requestedSemester: string | null | undefined,
  fallbackSemester: Semester
): Semester {
  return fromSemesterQueryValue(requestedSemester) ?? fallbackSemester;
}
