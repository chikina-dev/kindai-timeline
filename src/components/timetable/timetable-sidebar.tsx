import type { Course, Semester } from "@/types/timetable";
import { TimetableSidebarClient } from "./timetable-sidebar-client";

type TimetableSidebarProps = {
  initialAcademicYear: number;
  initialSemester: Semester;
  initialTimetable: Course[];
};

export function TimetableSidebar(props: TimetableSidebarProps) {
  return <TimetableSidebarClient {...props} />;
}
