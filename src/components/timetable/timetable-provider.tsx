"use client";

import { type ReactNode } from "react";
import { SWRConfig } from "swr";
import { CourseFilterProvider } from "@/components/timetable/course-filter-provider";
import type { Semester } from "@/types/timetable";
import type { TimetableSwrFallback } from "@/types/timetable-data";

type TimeTableProviderProps = {
  children: ReactNode;
  fallback: TimetableSwrFallback;
  initialAcademicYear: number;
  availableAcademicYears: number[];
  initialSemester: Semester;
};

export function TimeTableProvider({
  children,
  fallback,
  initialAcademicYear,
  availableAcademicYears,
  initialSemester,
}: TimeTableProviderProps) {
  return (
    <SWRConfig value={{ fallback }}>
      <CourseFilterProvider
        initialAcademicYear={initialAcademicYear}
        availableAcademicYears={availableAcademicYears}
        initialSemester={initialSemester}
      >
        {children}
      </CourseFilterProvider>
    </SWRConfig>
  );
}