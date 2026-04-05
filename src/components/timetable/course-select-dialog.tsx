"use client";

import { useState } from "react";
import { CourseFilterControls } from "@/components/timetable/course-filter-controls";
import { useSharedCourseFilters } from "@/components/timetable/course-filter-provider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useCourses, useUserTimetable } from "@/hooks/use-timetable";
import { type Course, type DayOfWeek, CATEGORIES } from "@/types/timetable";
import { Check, Trash2, BookOpen, User, MapPin, GraduationCap, ChevronDown } from "lucide-react";
import {
  filterCourses,
  getCourseClassOptions,
  getCourseGradeOptions,
  groupCoursesByName,
} from "@/lib/course-filters";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { CourseRequirementBadge } from "./course-requirement-badge";
import { CourseSyllabusLink } from "./course-syllabus-link";

type CourseSelectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  day: DayOfWeek;
  period: number;
  availableCourseCount: number;
  selectedCourse?: Course;
};

const categoryColors: Record<string, string> = {
  共通教養: "bg-[oklch(0.7_0.15_200)] text-[oklch(0.15_0_0)]",
  外国語: "bg-[oklch(0.75_0.12_60)] text-[oklch(0.15_0_0)]",
  専門: "bg-[oklch(0.65_0.18_145)] text-[oklch(0.15_0_0)]",
};

export function CourseSelectDialog({
  open,
  onOpenChange,
  day,
  period,
  availableCourseCount,
  selectedCourse,
}: CourseSelectDialogProps) {
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const {
    selectedAcademicYear,
    selectedSemester,
    searchTerm,
    setSearchTerm,
    selectedGrades,
    setSelectedGrades,
    selectedClasses,
    setSelectedClasses,
    resetSharedFilters,
  } = useSharedCourseFilters();
  const hasAvailableCourses = availableCourseCount > 0;
  const { data: courses, isLoading } = useCourses({
    day,
    period,
    academicYear: selectedAcademicYear,
    semester: selectedSemester,
  }, {
    enabled: open && hasAvailableCourses,
  });
  const { addCourse, removeCourse, timetable } = useUserTimetable({
    academicYear: selectedAcademicYear,
    semester: selectedSemester,
  }, {
    enabled: open && (hasAvailableCourses || Boolean(selectedCourse)),
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredCourses = filterCourses(courses, {
    category: categoryFilter,
    searchTerm,
    selectedGrades,
    selectedClasses,
  });
  const courseGroups = groupCoursesByName(filteredCourses);
  const gradeOptions = getCourseGradeOptions(courses);
  const classOptions = getCourseClassOptions(selectedClasses);

  const isInTimetable = (courseId: string) => {
    return timetable.some((c) => c.id === courseId);
  };

  const handleSelect = async (course: Course) => {
    setIsSubmitting(true);
    // If there's already a course in this slot, remove it first
    if (selectedCourse) {
      await removeCourse(selectedCourse.id);
    }
    const success = await addCourse(course);
    setIsSubmitting(false);
    if (success) {
      onOpenChange(false);
    }
  };

  const handleRemove = async () => {
    if (!selectedCourse) return;
    setIsSubmitting(true);
    const success = await removeCourse(selectedCourse.id);
    setIsSubmitting(false);
    if (success) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] flex! flex-col overflow-hidden sm:max-w-150">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{day}曜 {period}限</span>
            <Badge variant="outline">
              {selectedAcademicYear}年度 {selectedSemester}
            </Badge>
            {selectedCourse ? (
              <Badge variant="secondary">選択中: {selectedCourse.name}</Badge>
            ) : (
              <Badge variant="outline">科目を選択</Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {day}曜 {period}限に配置する科目を検索して選択します。
          </DialogDescription>
        </DialogHeader>

        {selectedCourse && (
          <div className="mb-4 rounded-lg bg-secondary/50 p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium">{selectedCourse.name}</p>
                <p className="text-sm text-muted-foreground">
                {selectedCourse.instructors?.join(", ")} / {selectedCourse.credits}単位
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <CourseRequirementBadge requirementType={selectedCourse.requirementType} />
                </div>
                {(selectedCourse.className || selectedCourse.classroom) && (
                  <p className="text-xs text-muted-foreground">
                    {[
                      selectedCourse.className ? `クラス: ${selectedCourse.className}` : null,
                      selectedCourse.classroom ? `教室: ${selectedCourse.classroom}` : null,
                    ]
                      .filter(Boolean)
                      .join(" / ")}
                  </p>
                )}
                <CourseSyllabusLink
                  syllabusId={selectedCourse.syllabusId}
                  className="mt-1 h-7 px-2 text-xs"
                  label="シラバスを開く"
                />
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleRemove}
                disabled={isSubmitting}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                削除
              </Button>
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="space-y-4 pb-1">
            <CourseFilterControls
              searchTerm={searchTerm}
              onSearchTermChange={setSearchTerm}
              selectedGrades={selectedGrades}
              onSelectedGradesChange={setSelectedGrades}
              gradeOptions={gradeOptions}
              selectedClasses={selectedClasses}
              onSelectedClassesChange={setSelectedClasses}
              classOptions={classOptions}
              onClearFilters={resetSharedFilters}
            />

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">分類:</span>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-37.5">
                    <SelectValue placeholder="分類で絞り込み" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべて</SelectItem>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <span className="text-xs text-muted-foreground">
                {hasAvailableCourses ? `${courseGroups.length}件` : "0件"}
              </span>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Spinner className="w-6 h-6" />
              </div>
            ) : !hasAvailableCourses ? (
              <div className="py-12 text-center text-muted-foreground">
                この曜日・時限に開講されている科目はありません
              </div>
            ) : filteredCourses.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                条件に一致する科目がありません
              </div>
            ) : (
              <div className="space-y-2 pb-4">
              {courseGroups.map((group) => {
                const hasMultipleVariants = group.variants.length > 1;
                const isExpanded = expandedGroup === group.name;
                const selectedVariant = group.variants.find((v) => isInTimetable(v.id));
                const isCurrentGroup = group.variants.some((v) => selectedCourse?.id === v.id);

                // Single variant: render flat (existing behavior)
                if (!hasMultipleVariants) {
                  const course = group.variants[0];
                  const isCurrentSelection = selectedCourse?.id === course.id;

                  return (
                    <div key={course.id} className="relative">
                      <CourseSyllabusLink
                        syllabusId={course.syllabusId}
                        iconOnly
                        className="absolute right-3 top-3 z-10 h-8 w-8 bg-background/80 backdrop-blur"
                      />
                      <button
                        onClick={() => !isCurrentSelection && handleSelect(course)}
                        disabled={isCurrentSelection || isSubmitting}
                        className={cn(
                          "w-full text-left p-4 rounded-lg border transition-all",
                          course.syllabusId && "pr-14",
                          isCurrentSelection
                            ? "border-accent bg-accent/10 cursor-default"
                            : "border-border hover:border-accent/50 hover:bg-secondary/50"
                        )}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge className={cn("text-xs", categoryColors[course.category])}>
                                {course.category}
                              </Badge>
                              <CourseRequirementBadge requirementType={course.requirementType} />
                              {course.features && (
                                <Badge variant="outline" className="text-xs">
                                  {course.features === "KICSオンデマンド"
                                    ? "KICS"
                                    : course.features === "メディア授業"
                                    ? "メディア"
                                    : "専門OD"}
                                </Badge>
                              )}
                            </div>
                            <h3 className="font-semibold text-foreground mb-2">
                              {course.name}
                            </h3>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted-foreground">
                              {course.instructors && (
                                <div className="flex items-center gap-1">
                                  <User className="w-3 h-3" />
                                  <span>{course.instructors.join(", ")}</span>
                                </div>
                              )}
                              <div className="flex items-center gap-1">
                                <BookOpen className="w-3 h-3" />
                                <span>{course.credits}単位</span>
                              </div>
                              {course.grades && (
                                <div className="flex items-center gap-1">
                                  <GraduationCap className="w-3 h-3" />
                                  <span>{course.grades.join(", ")}年</span>
                                </div>
                              )}
                              {course.className && (
                                <div className="flex items-center gap-1">
                                  <span>クラス: {course.className}</span>
                                </div>
                              )}
                              {course.classroom && (
                                <div className="flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  <span>{course.classroom}</span>
                                </div>
                              )}
                            </div>
                            {course.note && (
                              <p className="text-xs text-muted-foreground mt-2">
                                {course.note}
                              </p>
                            )}
                          </div>
                          {isCurrentSelection && (
                            <div className="shrink-0">
                              <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center">
                                <Check className="w-4 h-4 text-accent-foreground" />
                              </div>
                            </div>
                          )}
                        </div>
                      </button>
                    </div>
                  );
                }

                // Multiple variants: grouped with expand/collapse
                return (
                  <div
                    key={group.name}
                    className={cn(
                      "rounded-lg border transition-all",
                      isCurrentGroup
                        ? "border-accent bg-accent/5"
                        : "border-border"
                    )}
                  >
                    {/* Group header */}
                    <button
                      onClick={() => setExpandedGroup(isExpanded ? null : group.name)}
                      className="w-full text-left p-4 flex items-start justify-between gap-4"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={cn("text-xs", categoryColors[group.category])}>
                            {group.category}
                          </Badge>
                          <CourseRequirementBadge requirementType={group.requirementType} />
                          {group.features && (
                            <Badge variant="outline" className="text-xs">
                              {group.features === "KICSオンデマンド"
                                ? "KICS"
                                : group.features === "メディア授業"
                                ? "メディア"
                                : "専門OD"}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {group.variants.length}クラス
                          </span>
                        </div>
                        <h3 className="font-semibold text-foreground mb-1">
                          {group.name}
                        </h3>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <BookOpen className="w-3 h-3" />
                            <span>{group.credits}単位</span>
                          </div>
                          {group.grades && (
                            <div className="flex items-center gap-1">
                              <GraduationCap className="w-3 h-3" />
                              <span>{group.grades.join(", ")}年</span>
                            </div>
                          )}
                          {selectedVariant && (
                            <span className="text-accent text-xs font-medium">
                              選択中: {selectedVariant.className || selectedVariant.classroom || selectedVariant.instructors?.join(", ")}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronDown
                        className={cn(
                          "w-5 h-5 text-muted-foreground transition-transform mt-1",
                          isExpanded && "rotate-180"
                        )}
                      />
                    </button>

                    {/* Expanded class list */}
                    {isExpanded && (
                      <div className="px-4 pb-3 space-y-1.5 border-t border-border pt-3">
                        {group.variants.map((course) => {
                          const isCurrentSelection = selectedCourse?.id === course.id;

                          return (
                            <div key={course.id} className="relative">
                              <CourseSyllabusLink
                                syllabusId={course.syllabusId}
                                iconOnly
                                className="absolute right-2 top-2 z-10 h-7 w-7 bg-background/80 backdrop-blur"
                              />
                              <button
                                onClick={() => !isCurrentSelection && handleSelect(course)}
                                disabled={isCurrentSelection || isSubmitting}
                                className={cn(
                                  "w-full text-left px-3 py-2.5 rounded-md border transition-all text-sm",
                                  course.syllabusId && "pr-12",
                                  isCurrentSelection
                                    ? "border-accent bg-accent/10 cursor-default"
                                    : "border-border hover:border-accent/50 hover:bg-secondary/50"
                                )}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <CourseRequirementBadge
                                      requirementType={course.requirementType}
                                      className="shrink-0"
                                    />
                                    {course.className && (
                                      <Badge variant="outline" className="text-xs shrink-0">
                                        {course.className}
                                      </Badge>
                                    )}
                                    {course.classroom && (
                                      <div className="flex items-center gap-1 text-muted-foreground truncate">
                                        <MapPin className="w-3 h-3 shrink-0" />
                                        <span className="truncate">{course.classroom}</span>
                                      </div>
                                    )}
                                    {course.instructors && (
                                      <div className="flex items-center gap-1 text-muted-foreground truncate">
                                        <User className="w-3 h-3 shrink-0" />
                                        <span className="truncate">{course.instructors.join(", ")}</span>
                                      </div>
                                    )}
                                  </div>
                                  {isCurrentSelection && (
                                    <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center shrink-0">
                                      <Check className="w-3 h-3 text-accent-foreground" />
                                    </div>
                                  )}
                                </div>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
