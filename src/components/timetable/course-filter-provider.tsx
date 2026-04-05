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
import { getCourseCountForSlot } from "@/lib/course-availability";
import { toSemesterQueryValue } from "@/lib/academic-term";
import { normalizeSelectedCourseClasses } from "@/lib/course-filters";
import {
  resolveUserCourseProfile,
  type ResolvedUserCourseProfile,
  type UserCoursePreferences,
} from "@/lib/user-course-preferences";
import { useCourseAvailabilityCounts } from "@/hooks/use-timetable";
import type { Semester } from "@/types/timetable";
import type { DayOfWeek } from "@/types/timetable";
import type { CourseAvailabilityCounts } from "@/types/timetable-data";

function areNumberArraysEqual(left: number[], right: number[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function areStringArraysEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

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
  courseAvailabilityCounts?: CourseAvailabilityCounts;
  getAvailableCourseCount: (day: DayOfWeek, period: number) => number;
  ondemandCourseCount: number;
  isCourseAvailabilityLoading: boolean;
  resetSharedFilters: () => void;
  userCoursePreferences: UserCoursePreferences;
  saveUserCoursePreferences: (
    preferences: UserCoursePreferences,
    options?: { applyToFilters?: boolean }
  ) => Promise<void>;
  resolvedUserCourseProfile: ResolvedUserCourseProfile;
  applyProfileFilters: () => void;
};

type CourseFilterProviderProps = {
  children: ReactNode;
  initialAcademicYear: number;
  availableAcademicYears: number[];
  initialSemester: Semester;
  initialUserCoursePreferences: UserCoursePreferences;
};

const SharedCourseFilterContext =
  createContext<SharedCourseFilterContextValue | null>(null);

export function CourseFilterProvider({
  children,
  initialAcademicYear,
  availableAcademicYears,
  initialSemester,
  initialUserCoursePreferences,
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
  const [userCoursePreferences, setUserCoursePreferences] =
    useState<UserCoursePreferences>(initialUserCoursePreferences);
  const [autoAppliedGrades, setAutoAppliedGrades] = useState<number[]>([]);
  const [autoAppliedClasses, setAutoAppliedClasses] = useState<string[]>([]);
  const {
    data: courseAvailabilityCounts,
    isLoading: isCourseAvailabilityLoading,
  } = useCourseAvailabilityCounts({
    academicYear: selectedAcademicYear,
    semester: selectedSemester,
  });

  const setSelectedClasses = useCallback((values: string[]) => {
    setSelectedClassesState(normalizeSelectedCourseClasses(values));
  }, []);
  const resolvedUserCourseProfile = useMemo(
    () => resolveUserCourseProfile(userCoursePreferences, selectedAcademicYear),
    [selectedAcademicYear, userCoursePreferences]
  );

  const applyProfileFilters = useCallback(() => {
    const normalizedSelectedClasses = normalizeSelectedCourseClasses(
      resolvedUserCourseProfile.defaultSelectedClasses
    );

    setSearchTerm("");
    setSelectedGrades(resolvedUserCourseProfile.defaultSelectedGrades);
    setSelectedClassesState(normalizedSelectedClasses);
    setAutoAppliedGrades(resolvedUserCourseProfile.defaultSelectedGrades);
    setAutoAppliedClasses(normalizedSelectedClasses);
  }, [resolvedUserCourseProfile]);

  const saveUserCoursePreferences = useCallback(
    (
      preferences: UserCoursePreferences,
      options?: { applyToFilters?: boolean }
    ) => {
      const savePreferences = async () => {
        const response = await fetch("/api/user-course-preferences", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(preferences),
        });

        if (!response.ok) {
          throw new Error("Failed to save user course preferences");
        }

        const nextPreferences = (await response.json()) as UserCoursePreferences;
        setUserCoursePreferences(nextPreferences);

        if (options?.applyToFilters) {
          const nextProfile = resolveUserCourseProfile(
            nextPreferences,
            selectedAcademicYear
          );
          const normalizedSelectedClasses = normalizeSelectedCourseClasses(
            nextProfile.defaultSelectedClasses
          );

          setSearchTerm("");
          setSelectedGrades(nextProfile.defaultSelectedGrades);
          setSelectedClassesState(normalizedSelectedClasses);
          setAutoAppliedGrades(nextProfile.defaultSelectedGrades);
          setAutoAppliedClasses(normalizedSelectedClasses);
        }
      };

      return savePreferences();
    },
    [selectedAcademicYear]
  );

  const getAvailableCourseCount = useCallback(
    (day: DayOfWeek, period: number) =>
      getCourseCountForSlot(courseAvailabilityCounts, day, period),
    [courseAvailabilityCounts]
  );

  useEffect(() => {
    setUserCoursePreferences(initialUserCoursePreferences);
    setAutoAppliedGrades([]);
    setAutoAppliedClasses([]);
  }, [initialUserCoursePreferences]);

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

  useEffect(() => {
    const normalizedDefaultClasses = normalizeSelectedCourseClasses(
      resolvedUserCourseProfile.defaultSelectedClasses
    );
    const matchesAutoAppliedFilters =
      areNumberArraysEqual(selectedGrades, autoAppliedGrades) &&
      areStringArraysEqual(selectedClasses, autoAppliedClasses);
    const shouldApplyInitialDefaults =
      autoAppliedGrades.length === 0 &&
      autoAppliedClasses.length === 0 &&
      selectedGrades.length === 0 &&
      selectedClasses.length === 0 &&
      searchTerm.length === 0;
    const defaultsChanged =
      !areNumberArraysEqual(
        autoAppliedGrades,
        resolvedUserCourseProfile.defaultSelectedGrades
      ) ||
      !areStringArraysEqual(autoAppliedClasses, normalizedDefaultClasses);

    if ((!matchesAutoAppliedFilters && !shouldApplyInitialDefaults) || !defaultsChanged) {
      return;
    }

    setSelectedGrades(resolvedUserCourseProfile.defaultSelectedGrades);
    setSelectedClassesState(normalizedDefaultClasses);
    setAutoAppliedGrades(resolvedUserCourseProfile.defaultSelectedGrades);
    setAutoAppliedClasses(normalizedDefaultClasses);
  }, [
    autoAppliedClasses,
    autoAppliedGrades,
    resolvedUserCourseProfile,
    searchTerm,
    selectedClasses,
    selectedGrades,
  ]);

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
      courseAvailabilityCounts,
      getAvailableCourseCount,
      ondemandCourseCount: courseAvailabilityCounts?.ondemandCount ?? 0,
      isCourseAvailabilityLoading,
      resetSharedFilters: () => {
        setSearchTerm("");
        setSelectedGrades([]);
        setSelectedClassesState([]);
      },
      userCoursePreferences,
      saveUserCoursePreferences,
      resolvedUserCourseProfile,
      applyProfileFilters,
    }),
    [
      availableAcademicYears,
      applyProfileFilters,
      searchTerm,
      selectedAcademicYear,
      selectedClasses,
      selectedGrades,
      selectedSemester,
      setSelectedClasses,
      courseAvailabilityCounts,
      getAvailableCourseCount,
      isCourseAvailabilityLoading,
      resolvedUserCourseProfile,
      saveUserCoursePreferences,
      userCoursePreferences,
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