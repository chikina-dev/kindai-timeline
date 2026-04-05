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

export function getCourseGradeOptions(courses: Course[] | undefined) {
  return Array.from(
    new Set(courses?.flatMap((course) => course.grades ?? []) ?? [])
  ).sort((left, right) => left - right);
}

export function getCourseClassOptions() {
  return [...COURSE_CLASS_FILTER_OPTIONS];
}

function matchesSelectedClassFilter(className: string | null, selectedClass: string) {
  if (!className) {
    return false;
  }

  return className.includes(selectedClass);
}

export function filterCourses(
  courses: Course[] | undefined,
  filters: CourseFilterState
) {
  if (!courses) {
    return [];
  }

  const normalizedSearchTerm = filters.searchTerm.trim().toLocaleLowerCase();

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
      !course.grades?.some((grade) => filters.selectedGrades.includes(grade))
    ) {
      return false;
    }

    if (filters.selectedClasses.length > 0) {
      if (
        !filters.selectedClasses.some((selectedClass) =>
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