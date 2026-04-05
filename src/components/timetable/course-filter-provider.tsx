"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useEffect,
  useContext,
  useMemo,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toSemesterQueryValue } from "@/lib/academic-term";
import { normalizeSelectedCourseClasses } from "@/lib/course-filters";
import type { Semester } from "@/types/timetable";

type SharedCourseFilterContextValue = {
  selectedAcademicYear: number;
  setSelectedAcademicYear: (value: number) => void;
  availableAcademicYears: number[];
  selectedSemester: Semester;
  setSelectedSemester: (value: Semester) => void;
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  selectedGrades: number[];
  setSelectedGrades: (values: number[]) => void;
  selectedClasses: string[];
  setSelectedClasses: (values: string[]) => void;
  resetSharedFilters: () => void;
};

type CourseFilterProviderProps = {
  children: ReactNode;
  initialAcademicYear: number;
  availableAcademicYears: number[];
  initialSemester: Semester;
};

const SharedCourseFilterContext =
  createContext<SharedCourseFilterContextValue | null>(null);

export function CourseFilterProvider({
  children,
  initialAcademicYear,
  availableAcademicYears,
  initialSemester,
}: CourseFilterProviderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedAcademicYear, setSelectedAcademicYear] =
    useState(initialAcademicYear);
  const [selectedSemester, setSelectedSemester] =
    useState<Semester>(initialSemester);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedGrades, setSelectedGrades] = useState<number[]>([]);
  const [selectedClasses, setSelectedClassesState] = useState<string[]>([]);

  const setSelectedClasses = useCallback((values: string[]) => {
    setSelectedClassesState(normalizeSelectedCourseClasses(values));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const nextAcademicYear = String(selectedAcademicYear);
    const nextSemester = toSemesterQueryValue(selectedSemester);
    const hasAcademicYearChanged = params.get("academicYear") !== nextAcademicYear;
    const hasSemesterChanged = params.get("semester") !== nextSemester;

    if (!hasAcademicYearChanged && !hasSemesterChanged) {
      return;
    }

    params.set("academicYear", nextAcademicYear);
    params.set("semester", nextSemester);

    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
      scroll: false,
    });
  }, [pathname, router, searchParams, selectedAcademicYear, selectedSemester]);

  const value = useMemo(
    () => ({
      selectedAcademicYear,
      setSelectedAcademicYear,
      availableAcademicYears,
      selectedSemester,
      setSelectedSemester,
      searchTerm,
      setSearchTerm,
      selectedGrades,
      setSelectedGrades,
      selectedClasses,
      setSelectedClasses,
      resetSharedFilters: () => {
        setSearchTerm("");
        setSelectedGrades([]);
        setSelectedClassesState([]);
      },
    }),
    [
      availableAcademicYears,
      searchTerm,
      selectedAcademicYear,
      selectedClasses,
      selectedGrades,
      selectedSemester,
      setSelectedClasses,
    ]
  );

  return (
    <SharedCourseFilterContext.Provider value={value}>
      {children}
    </SharedCourseFilterContext.Provider>
  );
}

export function useSharedCourseFilters() {
  const context = useContext(SharedCourseFilterContext);

  if (!context) {
    throw new Error("useSharedCourseFilters must be used within CourseFilterProvider");
  }

  return context;
}