import type { Course, DayOfWeek, Semester } from "@/types/timetable";

export const PERIOD_TIMES = [
  { start: "09:00", end: "10:30" },
  { start: "10:45", end: "12:15" },
  { start: "13:15", end: "14:45" },
  { start: "15:00", end: "16:30" },
  { start: "16:45", end: "18:15" },
  { start: "18:25", end: "19:55" },
] as const;

const dayNumbers: Record<DayOfWeek, number> = {
  月: 1,
  火: 2,
  水: 3,
  木: 4,
  金: 5,
  土: 6,
  日: 0,
};

export function getDayNumber(day: DayOfWeek): number {
  return dayNumbers[day];
}

export function getPeriodTimeRange(periods: number[]) {
  const sortedPeriods = [...periods].sort((left, right) => left - right);
  const firstPeriod = PERIOD_TIMES[sortedPeriods[0] - 1];
  const lastPeriod = PERIOD_TIMES[sortedPeriods[sortedPeriods.length - 1] - 1];

  if (!firstPeriod || !lastPeriod) {
    return null;
  }

  return {
    start: firstPeriod.start,
    end: lastPeriod.end,
  };
}

export function findCourseByPosition(
  timetable: Course[],
  day: string,
  period: number
) {
  return timetable.find(
    (course) => course.day === day && course.periods?.includes(period)
  );
}

export function sortTimetableCourses(timetable: Course[]) {
  return [...timetable].sort((left, right) => {
    const leftDay = left.day ? getDayNumber(left.day) : Number.POSITIVE_INFINITY;
    const rightDay = right.day ? getDayNumber(right.day) : Number.POSITIVE_INFINITY;

    if (leftDay !== rightDay) {
      return leftDay - rightDay;
    }

    const leftFirstPeriod = Math.min(...(left.periods ?? [Number.POSITIVE_INFINITY]));
    const rightFirstPeriod = Math.min(...(right.periods ?? [Number.POSITIVE_INFINITY]));

    if (leftFirstPeriod !== rightFirstPeriod) {
      return leftFirstPeriod - rightFirstPeriod;
    }

    const nameComparison = left.name.localeCompare(right.name, "ja");

    if (nameComparison !== 0) {
      return nameComparison;
    }

    return left.id.localeCompare(right.id);
  });
}

export function isInitialTimetableSelection(
  selectedAcademicYear: number,
  selectedSemester: Semester,
  initialAcademicYear: number,
  initialSemester: Semester
) {
  return (
    selectedAcademicYear === initialAcademicYear &&
    selectedSemester === initialSemester
  );
}