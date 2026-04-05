import type { Course } from "@/types/timetable";

export type CourseGroup = {
  name: string;
  category: string;
  credits: number;
  grades: number[] | null;
  features: string | null;
  note: string | null;
  requirementType: Course["requirementType"];
  variants: Course[];
};

export type CourseFilterState = {
  category: string;
  searchTerm: string;
  selectedGrades: number[];
  selectedClasses: string[];
};

export const COURSE_CLASS_FILTER_OPTIONS = [
  "A",
  "B",
  "C",
  "再履修",
  "実世界",
  "サイバー",
  "知能",
] as const;

type CourseClassFilterOption = (typeof COURSE_CLASS_FILTER_OPTIONS)[number];

const EXCLUSIVE_COURSE_CLASS_FILTER_GROUPS: readonly CourseClassFilterOption[][] = [
  ["A", "B", "C"],
  ["実世界", "サイバー", "知能"],
];

function isCourseClassFilterOption(value: string): value is CourseClassFilterOption {
  return COURSE_CLASS_FILTER_OPTIONS.some((option) => option === value);
}

function getExclusiveCourseClassGroup(selectedClass: string) {
  if (!isCourseClassFilterOption(selectedClass)) {
    return null;
  }

  return (
    EXCLUSIVE_COURSE_CLASS_FILTER_GROUPS.find((group) =>
      group.includes(selectedClass)
    ) ?? null
  );
}

export function normalizeSelectedCourseClasses(selectedClasses: string[]) {
  const normalizedSelectedClasses: string[] = [];

  for (const selectedClass of selectedClasses) {
    if (normalizedSelectedClasses.includes(selectedClass)) {
      continue;
    }

    const exclusiveGroup = getExclusiveCourseClassGroup(selectedClass);

    if (
      exclusiveGroup &&
      normalizedSelectedClasses.some((currentSelectedClass) =>
        exclusiveGroup.includes(currentSelectedClass as CourseClassFilterOption)
      )
    ) {
      continue;
    }

    normalizedSelectedClasses.push(selectedClass);
  }

  return normalizedSelectedClasses;
}

export function getCourseGradeOptions(courses: Course[] | undefined) {
  return Array.from(
    new Set(courses?.flatMap((course) => course.grades ?? []) ?? [])
  ).sort((left, right) => left - right);
}

export function getCourseClassOptions(selectedClasses: string[] = []) {
  const normalizedSelectedClasses = normalizeSelectedCourseClasses(selectedClasses);
  const hiddenOptions = new Set<CourseClassFilterOption>();

  for (const group of EXCLUSIVE_COURSE_CLASS_FILTER_GROUPS) {
    const selectedOption = group.find((option) =>
      normalizedSelectedClasses.includes(option)
    );

    if (!selectedOption) {
      continue;
    }

    for (const option of group) {
      if (option !== selectedOption) {
        hiddenOptions.add(option);
      }
    }
  }

  return COURSE_CLASS_FILTER_OPTIONS.filter((option) => !hiddenOptions.has(option));
}

function matchesSelectedClassFilter(className: string | null, selectedClass: string) {
  if (!className) {
    return false;
  }

  return className.includes(selectedClass);
}

function isRetakeCourse(className: string | null) {
  return matchesSelectedClassFilter(className, "再履修");
}

export function filterCourses(
  courses: Course[] | undefined,
  filters: CourseFilterState
) {
  if (!courses) {
    return [];
  }

  const normalizedSearchTerm = filters.searchTerm.trim().toLocaleLowerCase();
  const normalizedSelectedClasses = normalizeSelectedCourseClasses(
    filters.selectedClasses
  );

  return courses.filter((course) => {
    if (filters.category !== "all" && course.category !== filters.category) {
      return false;
    }

    if (
      normalizedSearchTerm &&
      !course.name.toLocaleLowerCase().includes(normalizedSearchTerm)
    ) {
      return false;
    }

    if (
      filters.selectedGrades.length > 0 &&
      !isRetakeCourse(course.className) &&
      !course.grades?.some((grade) => filters.selectedGrades.includes(grade))
    ) {
      return false;
    }

    if (normalizedSelectedClasses.length > 0) {
      if (
        !(
          isRetakeCourse(course.className) &&
          !normalizedSelectedClasses.includes("再履修")
        ) &&
        !normalizedSelectedClasses.some((selectedClass) =>
          matchesSelectedClassFilter(course.className, selectedClass)
        )
      ) {
        return false;
      }
    }

    return true;
  });
}

export function groupCoursesByName(courses: Course[]) {
  const courseMap = new Map<string, Course[]>();

  for (const course of courses) {
    const variants = courseMap.get(course.name) ?? [];
    variants.push(course);
    courseMap.set(course.name, variants);
  }

  return Array.from(courseMap.entries()).map(([name, variants]) => {
    const sharedRequirementType = variants[0].requirementType;

    return {
      name,
      category: variants[0].category,
      credits: variants[0].credits,
      grades: variants[0].grades,
      features: variants[0].features,
      note: variants[0].note,
      requirementType:
        sharedRequirementType &&
        variants.every((variant) => variant.requirementType === sharedRequirementType)
        ? sharedRequirementType
        : null,
      variants,
    };
  }) satisfies CourseGroup[];
}