"use client";

import { useSharedCourseFilters } from "@/components/timetable/course-filter-provider";
import { PERIOD_TIMES } from "@/lib/timetable";
import { DAYS, PERIODS, type DayOfWeek } from "@/types/course-domain";
import { TimetableCell } from "./timetable-cell";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

export function TimetableGridClient() {
  const {
    getAvailableCourseCount,
    getCourseByPosition,
    isTimetableLoading,
    timetable,
  } = useSharedCourseFilters();
  const shouldShowLoading = isTimetableLoading && timetable.length === 0;

  if (shouldShowLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-140 origin-top-left [zoom:0.72] sm:min-w-200 sm:[zoom:1]">
        <div className="grid grid-cols-8 border-b border-border">
          <div className="p-2 text-center text-xs font-medium text-muted-foreground sm:p-3 sm:text-sm">
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

        <div className="divide-y divide-border">
          {PERIODS.map((period) => (
            <div key={period} className="grid grid-cols-8">
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

              {DAYS.map((day) => {
                const typedDay = day as DayOfWeek;
                const course = getCourseByPosition(typedDay, period);
                const availableCourseCount = getAvailableCourseCount(typedDay, period);

                return (
                  <TimetableCell
                    key={`${day}-${period}`}
                    day={typedDay}
                    period={period}
                    course={course}
                    availableCourseCount={availableCourseCount}
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