import type { Category, Feature } from "@/types/course-domain";
import type { Course } from "@/types/course-records";

export const TIMETABLE_CELL_CATEGORY_CLASS_BY_CATEGORY: Record<Category, string> = {
  共通教養:
    "bg-[oklch(0.7_0.15_200/0.15)] border-l-[oklch(0.7_0.15_200)] hover:bg-[oklch(0.7_0.15_200/0.25)]",
  外国語:
    "bg-[oklch(0.75_0.12_60/0.15)] border-l-[oklch(0.75_0.12_60)] hover:bg-[oklch(0.75_0.12_60/0.25)]",
  専門:
    "bg-[oklch(0.65_0.18_145/0.15)] border-l-[oklch(0.65_0.18_145)] hover:bg-[oklch(0.65_0.18_145/0.25)]",
};

export const TIMETABLE_CATEGORY_BADGE_CLASS_BY_CATEGORY: Record<Category, string> = {
  共通教養: "bg-[oklch(0.7_0.15_200)] text-[oklch(0.15_0_0)]",
  外国語: "bg-[oklch(0.75_0.12_60)] text-[oklch(0.15_0_0)]",
  専門: "bg-[oklch(0.65_0.18_145)] text-[oklch(0.15_0_0)]",
};

export const TIMETABLE_CATEGORY_STRIP_CLASS_BY_CATEGORY: Record<Category, string> = {
  共通教養: "bg-[oklch(0.7_0.15_200)]",
  外国語: "bg-[oklch(0.75_0.12_60)]",
  専門: "bg-[oklch(0.65_0.18_145)]",
};

export function getCourseFeatureLabel(feature: Feature | null | undefined) {
  if (!feature) {
    return null;
  }

  if (feature === "KICSオンデマンド") {
    return "KICS";
  }

  if (feature === "メディア授業") {
    return "メディア";
  }

  return "専門OD";
}

export function getCourseSlotDetail(course: Pick<Course, "className" | "classroom">) {
  return [course.className, course.classroom].filter(Boolean).join(" / ");
}

export function countCoursesByCategory(courses: Course[]) {
  return courses.reduce<Record<Category, number>>(
    (accumulator, course) => {
      accumulator[course.category] += 1;
      return accumulator;
    },
    {
      共通教養: 0,
      外国語: 0,
      専門: 0,
    }
  );
}

export function isCourseInTimetable(timetable: Course[], courseId: string) {
  return timetable.some((course) => course.id === courseId);
}

export function getScheduledTimetableStats(timetable: Course[]) {
  const scheduledCount = timetable.filter(
    (course) => Boolean(course.day && course.periods?.length)
  ).length;

  return {
    scheduledCount,
    unscheduledCount: timetable.length - scheduledCount,
  };
}

export function getTimetableTotalCredits(timetable: Course[]) {
  return timetable.reduce((sum, course) => sum + course.credits, 0);
}