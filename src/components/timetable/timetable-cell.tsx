"use client";

import { useState } from "react";
import {
  getCourseFeatureLabel,
  getCourseSlotDetail,
  TIMETABLE_CELL_CATEGORY_CLASS_BY_CATEGORY,
} from "@/lib/timetable-presentation";
import type { Course } from "@/types/course-records";
import type { DayOfWeek } from "@/types/course-domain";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import { CourseSelectDialog } from "./course-select-dialog";
import { CourseRequirementBadge } from "./course-requirement-badge";

type TimetableCellProps = {
  day: DayOfWeek;
  period: number;
  course?: Course;
  availableCourseCount: number;
};

export function TimetableCell({ day, period, course, availableCourseCount }: TimetableCellProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const slotDetail = course ? getCourseSlotDetail(course) : "";
  const featureLabel = getCourseFeatureLabel(course?.features);
  const canAddCourse = availableCourseCount > 0;

  if (!course) {
    return (
      <>
        <div className="relative h-18 sm:h-25">
          {canAddCourse ? (
            <button
              onClick={() => setIsDialogOpen(true)}
              className="group flex h-full w-full items-center justify-center border-r border-border transition-colors hover:bg-secondary/50"
            >
              <Plus className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 sm:h-5 sm:w-5" />
            </button>
          ) : (
            <div className="h-full w-full border-r border-border" />
          )}
        </div>
        <CourseSelectDialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          day={day}
          period={period}
          availableCourseCount={availableCourseCount}
        />
      </>
    );
  }

  return (
    <>
      <div className="relative h-18 sm:h-25">
        <button
          onClick={() => setIsDialogOpen(true)}
          className={cn(
            "flex h-full w-full flex-col overflow-hidden border-r border-l-4 border-border p-1.5 text-left transition-colors sm:p-2",
            TIMETABLE_CELL_CATEGORY_CLASS_BY_CATEGORY[course.category]
          )}
        >
          <div className="flex h-full min-h-0 flex-col overflow-hidden">
            <p className="line-clamp-2 shrink-0 text-xs font-medium text-foreground sm:text-sm">
              {course.name}
            </p>
            {(course.requirementType || featureLabel) && (
              <div className="flex shrink-0 flex-wrap gap-1 pt-0.5 sm:pt-1">
                <CourseRequirementBadge
                  requirementType={course.requirementType}
                  compact
                />
                {featureLabel && (
                  <span className="inline-flex h-4 items-center rounded bg-secondary px-1 text-[9px] leading-none text-secondary-foreground sm:px-1.5 sm:text-[10px]">
                    {featureLabel}
                  </span>
                )}
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-hidden pt-0.5 sm:pt-1">
              {course.instructors && (
                <p className="truncate text-[10px] text-muted-foreground sm:text-xs">
                  {course.instructors.join(", ")}
                </p>
              )}
              {slotDetail && (
                <p className="truncate text-[10px] text-muted-foreground sm:text-xs">
                  {slotDetail}
                </p>
              )}
            </div>
          </div>
        </button>
      </div>
      <CourseSelectDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        day={day}
        period={period}
        selectedCourse={course}
        availableCourseCount={availableCourseCount}
      />
    </>
  );
}
