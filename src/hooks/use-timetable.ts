import useSWR, { mutate as globalMutate } from "swr";
import { toSemesterQueryValue } from "@/lib/academic-term";
import type { Course, Semester } from "@/types/timetable";

const TIMETABLE_ENDPOINT = "/api/timetable";

const fetcher = async (url: string): Promise<Course[]> => {
  const res = await fetch(url);
  return res.json() as Promise<Course[]>;
};

type CourseQueryFilters = {
  day?: string;
  period?: number;
  category?: string;
  semester?: Semester;
  academicYear?: number;
  ondemand?: boolean;
};

function buildCoursesUrl(basePath: string, filters?: CourseQueryFilters) {
  const params = new URLSearchParams();

  if (filters?.ondemand) {
    params.set("ondemand", "true");
  } else {
    if (filters?.day) params.set("day", filters.day);
    if (filters?.period) params.set("period", String(filters.period));
  }

  if (filters?.category) params.set("category", filters.category);
  if (filters?.semester) {
    params.set("semester", toSemesterQueryValue(filters.semester));
  }
  if (filters?.academicYear) {
    params.set("academicYear", String(filters.academicYear));
  }

  const queryString = params.toString();
  return `${basePath}${queryString ? `?${queryString}` : ""}`;
}

export function useCourses(filters?: CourseQueryFilters) {
  const url = buildCoursesUrl("/api/courses", filters);

  return useSWR<Course[]>(url, fetcher);
}

export function useUserTimetable(filters?: Pick<CourseQueryFilters, "semester" | "academicYear">) {
  const url = buildCoursesUrl(TIMETABLE_ENDPOINT, filters);
  const { data, error, isLoading, mutate } = useSWR<Course[]>(url, fetcher);

  const courseMatchesKey = (course: Course, key: string) => {
    const parsed = new URL(key, "http://localhost");
    const semester = parsed.searchParams.get("semester");
    const academicYear = parsed.searchParams.get("academicYear");

    if (semester && semester !== toSemesterQueryValue(course.semester)) {
      return false;
    }

    if (academicYear && academicYear !== String(course.academicYear)) {
      return false;
    }

    return true;
  };

  const revalidateOtherTimetableCaches = async () => {
    await globalMutate(
      (key) =>
        typeof key === "string" && key.startsWith(TIMETABLE_ENDPOINT) && key !== url,
      undefined,
      { revalidate: true }
    );
  };

  const addCourse = async (course: Course) => {
    try {
      const res = await fetch(TIMETABLE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: course.id }),
      });
      if (!res.ok) throw new Error("Failed to add course");
      if (courseMatchesKey(course, url)) {
        await mutate((current) => {
          if (!current) {
            return [course];
          }

          if (current.some((item) => item.id === course.id)) {
            return current;
          }

          return [...current, course];
        }, { revalidate: false });
      }
      await revalidateOtherTimetableCaches();
      return true;
    } catch (error) {
      console.error("Error adding course:", error);
      return false;
    }
  };

  const removeCourse = async (courseId: string) => {
    try {
      const res = await fetch(TIMETABLE_ENDPOINT, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId }),
      });
      if (!res.ok) throw new Error("Failed to remove course");
      await mutate((current) => current?.filter((course) => course.id !== courseId) ?? current, {
        revalidate: false,
      });
      await revalidateOtherTimetableCaches();
      return true;
    } catch (error) {
      console.error("Error removing course:", error);
      return false;
    }
  };

  const getCourseByPosition = (
    day: string,
    period: number
  ): Course | undefined => {
    return data?.find(
      (course) => course.day === day && course.periods?.includes(period)
    );
  };

  const totalCredits =
    data?.reduce((sum, course) => sum + course.credits, 0) || 0;

  return {
    timetable: data || [],
    isLoading,
    error,
    addCourse,
    removeCourse,
    getCourseByPosition,
    totalCredits,
    mutate,
  };
}
