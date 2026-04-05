"use client";

import { useSharedCourseFilters } from "@/components/timetable/course-filter-provider";
import { useUserTimetable } from "@/hooks/use-timetable";
import { PERIOD_TIMES } from "@/lib/timetable";
import { DAYS, PERIODS, type DayOfWeek } from "@/types/timetable";
import { TimetableCell } from "./timetable-cell";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

export function TimetableGrid() {
  const {
    selectedAcademicYear,
    selectedSemester,
    getAvailableCourseCount,
  } = useSharedCourseFilters();
  const { getCourseByPosition, isLoading } = useUserTimetable({
    academicYear: selectedAcademicYear,
    semester: selectedSemester,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-140 origin-top-left [zoom:0.72] sm:min-w-200 sm:[zoom:1]">
        {/* Header */}
        <div className="grid grid-cols-8 border-b border-border">
          <div className="p-2 text-center text-xs text-muted-foreground font-medium sm:p-3 sm:text-sm">
            時限
          </div>
          {DAYS.map((day) => (
            <div
              key={day}
              className={cn(
                "p-2 text-center text-xs font-semibold sm:p-3 sm:text-sm",
                day === "土" || day === "日"
                  ? "text-muted-foreground"
                  : "text-foreground"
              )}
            >
              {day}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="divide-y divide-border">
          {PERIODS.map((period) => (
            <div key={period} className="grid grid-cols-8">
              {/* Period column */}
              <div className="flex h-18 min-w-14 flex-col items-center justify-center border-r border-border p-2 sm:h-25 sm:min-w-16 sm:p-3">
                <span className="text-base font-semibold text-foreground sm:text-lg">
                  {period}
                </span>
                <span className="text-[10px] text-muted-foreground sm:text-xs">
                  {PERIOD_TIMES[period - 1].start}
                </span>
                <span className="text-[10px] text-muted-foreground sm:text-xs">
                  {PERIOD_TIMES[period - 1].end}
                </span>
              </div>

              {/* Day cells */}
              {DAYS.map((day) => {
                const course = getCourseByPosition(day, period);
                return (
                  <TimetableCell
                    key={`${day}-${period}`}
                    day={day as DayOfWeek}
                    period={period}
                    course={course}
                    availableCourseCount={getAvailableCourseCount(day as DayOfWeek, period)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
