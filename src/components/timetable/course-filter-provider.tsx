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
import { findCourseByPosition } from "@/lib/timetable";
import {
  buildTimetableApiUrl,
  TIMETABLE_ENDPOINT,
  TIMETABLE_PAGE_DATA_ENDPOINT,
  buildTimetablePageDataApiUrl,
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
  addCourse: (course: Course) => Promise<boolean>;
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
  const snapshotUrl = buildTimetablePageDataApiUrl(TIMETABLE_PAGE_DATA_ENDPOINT, {
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
  const timetable = useMemo(
    () => timetableSnapshot?.timetable ?? [],
    [timetableSnapshot?.timetable]
  );

  const setSelectedClasses = useCallback((values: string[]) => {
    setSelectedClassesState(normalizeSelectedCourseClasses(values));
  }, []);
  const resolvedUserCourseProfile = useMemo(
    () => resolveUserCourseProfile(userCoursePreferences, selectedAcademicYear),
    [selectedAcademicYear, userCoursePreferences]
  );

  const revalidateOtherSnapshotCaches = useCallback(async () => {
    await globalMutate(
      (key) =>
        typeof key === "string" &&
        key.startsWith(TIMETABLE_PAGE_DATA_ENDPOINT) &&
        key !== snapshotUrl,
      undefined,
      { revalidate: true }
    );
  }, [snapshotUrl]);

  const syncCurrentTimetableCaches = useCallback(
    async (
      updater: (current: TimetableSnapshot | undefined) => TimetableSnapshot | undefined
    ) => {
      let nextTimetable: Course[] | undefined;

      await mutateTimetableSnapshot(
        (current) => {
          const nextSnapshot = updater(current);
          nextTimetable = nextSnapshot?.timetable;
          return nextSnapshot;
        },
        { revalidate: false }
      );

      if (nextTimetable) {
        await globalMutate(timetableUrl, nextTimetable, { revalidate: false });
      }
    },
    [mutateTimetableSnapshot, timetableUrl]
  );

  const revalidateCurrentTimetableCaches = useCallback(async () => {
    await Promise.all([
      globalMutate(snapshotUrl),
      globalMutate(timetableUrl),
    ]);
  }, [snapshotUrl, timetableUrl]);

  const addCourse = useCallback(
    async (course: Course) => {
      try {
        const response = await fetch(TIMETABLE_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ courseId: course.id }),
        });

        if (!response.ok) {
          throw new Error("Failed to add course");
        }

        await syncCurrentTimetableCaches(
          (current) => {
            if (!current) {
              return current;
            }

            if (current.timetable.some((item) => item.id === course.id)) {
              return current;
            }

            return {
              ...current,
              timetable: [...current.timetable, course],
            } satisfies TimetableSnapshot;
          },
        );

        await Promise.all([
          revalidateCurrentTimetableCaches(),
          revalidateOtherSnapshotCaches(),
        ]);
        return true;
      } catch (error) {
        console.error("Error adding course:", error);
        return false;
      }
    },
    [
      revalidateCurrentTimetableCaches,
      revalidateOtherSnapshotCaches,
      syncCurrentTimetableCaches,
    ]
  );

  const removeCourse = useCallback(
    async (courseId: string) => {
      try {
        const response = await fetch(TIMETABLE_ENDPOINT, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ courseId }),
        });

        if (!response.ok) {
          throw new Error("Failed to remove course");
        }

        await syncCurrentTimetableCaches(
          (current) => {
            if (!current) {
              return current;
            }

            return {
              ...current,
              timetable: current.timetable.filter((course) => course.id !== courseId),
            } satisfies TimetableSnapshot;
          },
        );

        await Promise.all([
          revalidateCurrentTimetableCaches(),
          revalidateOtherSnapshotCaches(),
        ]);
        return true;
      } catch (error) {
        console.error("Error removing course:", error);
        return false;
      }
    },
    [
      revalidateCurrentTimetableCaches,
      revalidateOtherSnapshotCaches,
      syncCurrentTimetableCaches,
    ]
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
        await syncCurrentTimetableCaches(
          (current) => {
            if (!current) {
              return current;
            }

            return {
              ...current,
              userCoursePreferences: nextPreferences,
            } satisfies TimetableSnapshot;
          },
        );
        await Promise.all([
          revalidateCurrentTimetableCaches(),
          revalidateOtherSnapshotCaches(),
        ]);

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
    [
      revalidateCurrentTimetableCaches,
      revalidateOtherSnapshotCaches,
      selectedAcademicYear,
      syncCurrentTimetableCaches,
    ]
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