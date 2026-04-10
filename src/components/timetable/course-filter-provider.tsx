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
import { mutate as globalMutate } from "swr";
import {
  areNumberArraysEqual,
  areStringArraysEqual,
} from "@/lib/course-filter-state";
import { getCourseCountForSlot } from "@/lib/course-availability";
import { toSemesterQueryValue } from "@/lib/academic-term";
import { normalizeSelectedCourseClasses } from "@/lib/course-filters";
import {
  getTimetableTotalCredits,
} from "@/lib/timetable-presentation";
import { findCourseByPosition, sortTimetableCourses } from "@/lib/timetable";
import {
  buildTimetableApiUrl,
  TIMETABLE_ENDPOINT,
} from "@/lib/timetable-api";
import {
  createDefaultUserCoursePreferences,
  resolveUserCourseProfile,
  type ResolvedUserCourseProfile,
  type UserCoursePreferences,
} from "@/lib/user-course-preferences";
import { useTimetableSnapshot } from "@/hooks/use-timetable";
import type { Course } from "@/types/course-records";
import type { DayOfWeek, Semester } from "@/types/course-domain";
import type { CourseAvailabilityCounts, TimetableSnapshot } from "@/types/timetable-query";

type TimetableMutationResponse = {
  success: boolean;
  timetable: Course[];
};

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
  warningMessage?: string;
  timetable: Course[];
  isTimetableLoading: boolean;
  addCourse: (
    course: Course,
    options?: { replaceCourseId?: string }
  ) => Promise<boolean>;
  removeCourse: (courseId: string) => Promise<boolean>;
  getCourseByPosition: (day: DayOfWeek, period: number) => Course | undefined;
  totalCredits: number;
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
  const [autoAppliedGrades, setAutoAppliedGrades] = useState<number[]>([]);
  const [autoAppliedClasses, setAutoAppliedClasses] = useState<string[]>([]);
  const {
    data: timetableSnapshot,
    isLoading: isTimetableLoading,
    mutate: mutateTimetableSnapshot,
  } = useTimetableSnapshot({
    academicYear: selectedAcademicYear,
    semester: selectedSemester,
  });
  const timetableUrl = buildTimetableApiUrl(TIMETABLE_ENDPOINT, {
    academicYear: selectedAcademicYear,
    semester: selectedSemester,
  });
  const userCoursePreferences =
    timetableSnapshot?.userCoursePreferences ??
    createDefaultUserCoursePreferences();
  const courseAvailabilityCounts = timetableSnapshot?.courseAvailabilityCounts;
  const [timetable, setTimetable] = useState<Course[]>(
    timetableSnapshot?.timetable ?? []
  );

  const setSelectedClasses = useCallback((values: string[]) => {
    setSelectedClassesState(normalizeSelectedCourseClasses(values));
  }, []);

  useEffect(() => {
    setTimetable(timetableSnapshot?.timetable ?? []);
  }, [timetableSnapshot?.timetable]);

  const resolvedUserCourseProfile = useMemo(
    () => resolveUserCourseProfile(userCoursePreferences, selectedAcademicYear),
    [selectedAcademicYear, userCoursePreferences]
  );

  const syncCurrentTimetableCaches = useCallback(
    async (nextTimetable: Course[]) => {
      const sortedTimetable = sortTimetableCourses(nextTimetable);

      setTimetable(sortedTimetable);

      await mutateTimetableSnapshot(
        (current) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            timetable: sortedTimetable,
          } satisfies TimetableSnapshot;
        },
        { revalidate: false }
      );

      await globalMutate(timetableUrl, sortedTimetable, { revalidate: false });
    },
    [mutateTimetableSnapshot, timetableUrl]
  );

  const addCourse = useCallback(
    async (course: Course, options?: { replaceCourseId?: string }) => {
      try {
        const response = await fetch(TIMETABLE_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            courseId: course.id,
            replaceCourseId: options?.replaceCourseId,
            academicYear: selectedAcademicYear,
            semester: selectedSemester,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to add course");
        }

        const result = (await response.json()) as TimetableMutationResponse;

        await syncCurrentTimetableCaches(result.timetable);

        return true;
      } catch (error) {
        console.error("Error adding course:", error);
        return false;
      }
    },
    [selectedAcademicYear, selectedSemester, syncCurrentTimetableCaches]
  );

  const removeCourse = useCallback(
    async (courseId: string) => {
      try {
        const response = await fetch(TIMETABLE_ENDPOINT, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            courseId,
            academicYear: selectedAcademicYear,
            semester: selectedSemester,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to remove course");
        }

        const result = (await response.json()) as TimetableMutationResponse;

        await syncCurrentTimetableCaches(result.timetable);

        return true;
      } catch (error) {
        console.error("Error removing course:", error);
        return false;
      }
    },
    [selectedAcademicYear, selectedSemester, syncCurrentTimetableCaches]
  );

  const getCourseByPosition = useCallback(
    (day: DayOfWeek, period: number) => findCourseByPosition(timetable, day, period),
    [timetable]
  );

  const totalCredits = useMemo(
    () => getTimetableTotalCredits(timetable),
    [timetable]
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
        await mutateTimetableSnapshot(
          (current) => {
            if (!current) {
              return current;
            }

            return {
              ...current,
              userCoursePreferences: nextPreferences,
            } satisfies TimetableSnapshot;
          },
          { revalidate: false }
        );

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
    [mutateTimetableSnapshot, selectedAcademicYear]
  );

  const getAvailableCourseCount = useCallback(
    (day: DayOfWeek, period: number) =>
      getCourseCountForSlot(courseAvailabilityCounts, day, period),
    [courseAvailabilityCounts]
  );

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
      addCourse,
      getCourseByPosition,
      isTimetableLoading,
      removeCourse,
      selectedSemester,
      setSelectedSemester,
      searchTerm,
      setSearchTerm,
      selectedGrades,
      setSelectedGrades,
      selectedClasses,
      setSelectedClasses,
      isCourseAvailabilityLoading: isTimetableLoading,
      courseAvailabilityCounts,
      getAvailableCourseCount,
      ondemandCourseCount: courseAvailabilityCounts?.ondemandCount ?? 0,
      timetable,
      totalCredits,
      warningMessage: timetableSnapshot?.warningMessage,
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
      getCourseByPosition,
      applyProfileFilters,
      availableAcademicYears,
      isTimetableLoading,
      removeCourse,
      searchTerm,
      selectedAcademicYear,
      timetable,
      timetableSnapshot?.warningMessage,
      totalCredits,
      addCourse,
      selectedClasses,
      selectedGrades,
      selectedSemester,
      setSelectedClasses,
      courseAvailabilityCounts,
      getAvailableCourseCount,
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