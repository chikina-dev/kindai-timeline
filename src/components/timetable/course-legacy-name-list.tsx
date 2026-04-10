import type { Course } from "@/types/course-records";
import { cn } from "@/lib/utils";

type CourseLegacyNameListProps = {
  course: Pick<Course, "legacyNames">;
  compact?: boolean;
  className?: string;
};

export function CourseLegacyNameList({
  course,
  compact = false,
  className,
}: CourseLegacyNameListProps) {
  if (course.legacyNames.length === 0) {
    return null;
  }

  if (compact) {
    return (
      <div className={cn("mt-1 flex flex-wrap gap-1", className)}>
        {course.legacyNames.map((legacyName) => (
          <span
            key={`${legacyName.legacyAcademicYear}-${legacyName.legacyName}`}
            className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground"
          >
            {legacyName.legacyAcademicYear}年度名: {legacyName.legacyName}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("mt-2 rounded-md border border-border/60 bg-background/60 p-2", className)}>
      <p className="text-[10px] font-medium text-muted-foreground sm:text-xs">
        旧称
      </p>
      <div className="mt-1 space-y-1">
        {course.legacyNames.map((legacyName) => (
          <div
            key={`${legacyName.legacyAcademicYear}-${legacyName.legacyName}`}
            className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] sm:text-xs"
          >
            <span className="font-medium text-foreground">{legacyName.legacyName}</span>
            <span className="text-muted-foreground">
              {legacyName.legacyAcademicYear}年度名
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}