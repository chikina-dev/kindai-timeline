import type { Course, Semester } from "@/types/timetable";
import type { CourseAvailabilityCounts } from "@/types/timetable-data";
import { TimetableGridClient } from "./timetable-grid-client";

type TimetableGridProps = {
  initialAcademicYear: number;
  initialSemester: Semester;
  initialTimetable: Course[];
  initialCourseAvailabilityCounts: CourseAvailabilityCounts;
};

export function TimetableGrid(props: TimetableGridProps) {
  return <TimetableGridClient {...props} />;
}
