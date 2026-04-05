import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Requirement } from "@/types/course-domain";

type CourseRequirementBadgeProps = {
  requirementType: Requirement | null | undefined;
  className?: string;
  compact?: boolean;
};

const requirementBadgeColors: Record<Requirement, string> = {
  必修科目: "border-emerald-500/40 bg-emerald-500/12 text-emerald-700 dark:text-emerald-200",
  選択必修科目: "border-amber-500/40 bg-amber-500/14 text-amber-700 dark:text-amber-200",
  選択科目: "border-sky-500/40 bg-sky-500/12 text-sky-700 dark:text-sky-200",
  自由選択科目: "border-border bg-secondary/70 text-muted-foreground",
};

const compactRequirementLabels: Record<Requirement, string> = {
  必修科目: "必修",
  選択必修科目: "選必",
  選択科目: "選択",
  自由選択科目: "自由",
};

export function CourseRequirementBadge({
  requirementType,
  className,
  compact = false,
}: CourseRequirementBadgeProps) {
  if (!requirementType) {
    return null;
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        compact
          ? "h-4 px-1 text-[9px] leading-none sm:px-1.5 sm:text-[10px]"
          : "text-[10px] sm:text-xs",
        requirementBadgeColors[requirementType],
        className
      )}
    >
      {compact ? compactRequirementLabels[requirementType] : requirementType}
    </Badge>
  );
}