"use client";

import {
  createContext,
  type ReactNode,
  useContext,
} from "react";
import { SWRConfig } from "swr";
import { CourseFilterProvider } from "@/components/timetable/course-filter-provider";
import type { Semester } from "@/types/timetable";
import type { TimetableSwrFallback } from "@/types/timetable-data";

type TimeTableContextValue = {
  warningMessage?: string;
};

type TimeTableProviderProps = {
  children: ReactNode;
  fallback: TimetableSwrFallback;
  initialAcademicYear: number;
  availableAcademicYears: number[];
  initialSemester: Semester;
  warningMessage?: string;
};

const TimeTableContext = createContext<TimeTableContextValue | null>(null);

export function TimeTableProvider({
  children,
  fallback,
  initialAcademicYear,
  availableAcademicYears,
  initialSemester,
  warningMessage,
}: TimeTableProviderProps) {
  return (
    <SWRConfig value={{ fallback }}>
      <TimeTableContext.Provider value={{ warningMessage }}>
        <CourseFilterProvider
          initialAcademicYear={initialAcademicYear}
          availableAcademicYears={availableAcademicYears}
          initialSemester={initialSemester}
        >
          {children}
        </CourseFilterProvider>
      </TimeTableContext.Provider>
    </SWRConfig>
  );
}

export function useTimeTableContext() {
  const context = useContext(TimeTableContext);

  if (!context) {
    throw new Error("useTimeTableContext must be used within TimeTableProvider");
  }

  return context;
}