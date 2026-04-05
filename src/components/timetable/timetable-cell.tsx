"use client";

import { useState } from "react";
import { type Course, type DayOfWeek } from "@/types/timetable";
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

const categoryColors: Record<string, string> = {
  共通教養: "bg-[oklch(0.7_0.15_200/0.15)] border-l-[oklch(0.7_0.15_200)] hover:bg-[oklch(0.7_0.15_200/0.25)]",
  外国語: "bg-[oklch(0.75_0.12_60/0.15)] border-l-[oklch(0.75_0.12_60)] hover:bg-[oklch(0.75_0.12_60/0.25)]",
  専門: "bg-[oklch(0.65_0.18_145/0.15)] border-l-[oklch(0.65_0.18_145)] hover:bg-[oklch(0.65_0.18_145/0.25)]",
};

function getFeatureLabel(feature: Course["features"] | undefined) {
  if (!feature) {
    return null;
  }

  if (feature === "KICSオンデマンド") {
    return "KICS";
  }

  if (feature === "メディア授業") {
    return "メディア";
  }

  return "専門OD";
}

export function TimetableCell({ day, period, course, availableCourseCount }: TimetableCellProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const slotDetail = [course?.className, course?.classroom].filter(Boolean).join(" / ");
  const featureLabel = getFeatureLabel(course?.features);

  if (!course) {
    return (
      <>
        <div className="relative h-18 sm:h-25">
          <button
            onClick={() => setIsDialogOpen(true)}
            className="group flex h-full w-full items-center justify-center border-r border-border transition-colors hover:bg-secondary/50"
          >
            <Plus className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 sm:h-5 sm:w-5" />
          </button>
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
            categoryColors[course.category]
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
