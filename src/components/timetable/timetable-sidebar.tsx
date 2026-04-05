"use client";

import { useState } from "react";
import { useSharedCourseFilters } from "@/components/timetable/course-filter-provider";
import { useUserTimetable } from "@/hooks/use-timetable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Trash2, BookOpen, User, MapPin, Plus, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { OndemandCourseDialog } from "./ondemand-course-dialog";
import { IcsDownloadDialog } from "./ics-download-dialog";
import { CourseRequirementBadge } from "./course-requirement-badge";
import { CourseSyllabusLink } from "./course-syllabus-link";

const categoryColors: Record<string, string> = {
  共通教養: "bg-[oklch(0.7_0.15_200)]",
  外国語: "bg-[oklch(0.75_0.12_60)]",
  専門: "bg-[oklch(0.65_0.18_145)]",
};

const dayOrder = ["月", "火", "水", "木", "金", "土", "日"];

export function TimetableSidebar() {
  const [ondemandOpen, setOndemandOpen] = useState(false);
  const [icsOpen, setIcsOpen] = useState(false);
  const { selectedAcademicYear, selectedSemester } = useSharedCourseFilters();
  const { timetable, isLoading, removeCourse, totalCredits } = useUserTimetable({
    academicYear: selectedAcademicYear,
    semester: selectedSemester,
  });

  const sortedTimetable = [...timetable].sort((a, b) => {
    const dayA = a.day ? dayOrder.indexOf(a.day) : 99;
    const dayB = b.day ? dayOrder.indexOf(b.day) : 99;
    if (dayA !== dayB) return dayA - dayB;
    const periodA = a.periods?.[0] || 99;
    const periodB = b.periods?.[0] || 99;
    return periodA - periodB;
  });

  const handleRemove = async (courseId: string) => {
    await removeCourse(courseId);
  };

  return (
    <Card className="gap-0 overflow-hidden">
      <CardHeader className="px-4 pb-3 sm:px-6">
        <CardTitle className="flex items-center justify-between">
          <span className="text-base sm:text-lg">登録科目</span>
          <Badge variant="outline" className="text-[11px] sm:text-xs">
            {totalCredits}単位
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 p-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner className="w-6 h-6" />
          </div>
        ) : timetable.length === 0 ? (
          <div className="text-center py-12 px-4">
            <BookOpen className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">
              まだ科目が登録されていません
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              時間割のセルをクリックして科目を追加してください
            </p>
          </div>
        ) : (
          <div className="h-80 overflow-y-auto overflow-x-hidden sm:h-100">
            <div className="space-y-2 px-3 pb-3 pt-0 sm:p-4 sm:pt-0">
              {sortedTimetable.map((course) => (
                <div
                  key={course.id}
                  className="group relative rounded-lg border border-border p-2.5 transition-colors hover:bg-secondary/50 sm:p-3"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "w-1 h-full min-h-10 rounded-full shrink-0",
                        categoryColors[course.category]
                      )}
                    />
                    <div className="relative min-w-0 flex-1 pr-8">
                      <CourseSyllabusLink
                        syllabusId={course.syllabusId}
                        iconOnly
                        className="absolute right-0 top-0 z-10 h-7 w-7"
                      />
                      <div className="mb-1 flex flex-wrap items-center gap-2 pr-1">
                        <Badge variant="secondary" className="text-[10px] sm:text-xs">
                          {course.day ? `${course.day}${course.periods?.[0]}限` : "集中"}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground sm:text-xs">
                          {course.credits}単位
                        </span>
                        <CourseRequirementBadge requirementType={course.requirementType} />
                      </div>
                      <h4 className="min-w-0 line-clamp-2 text-xs font-medium text-foreground sm:text-sm">
                        {course.name}
                      </h4>
                      {course.instructors && (
                        <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground sm:text-xs">
                          <User className="h-3 w-3" />
                          <span className="truncate">
                            {course.instructors.join(", ")}
                          </span>
                        </div>
                      )}
                      {course.className && (
                        <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground sm:text-xs">
                          <span className="truncate">
                            クラス: {course.className}
                          </span>
                        </div>
                      )}
                      {course.classroom && (
                        <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground sm:text-xs">
                          <MapPin className="h-3 w-3" />
                          <span className="truncate">
                            {course.classroom}
                          </span>
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      onClick={() => handleRemove(course.id)}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
      <div className="shrink-0 space-y-2 border-t border-border px-3 pb-3 pt-3 sm:px-4 sm:pb-4 sm:pt-4">
        <Button
          variant="outline"
          className="h-9 w-full text-xs sm:h-10 sm:text-sm"
          onClick={() => setOndemandOpen(true)}
        >
          <Plus className="mr-2 h-4 w-4" />
          オンデマンド・集中講義を追加
        </Button>
        <Button
          variant="outline"
          className="h-9 w-full text-xs sm:h-10 sm:text-sm"
          onClick={() => setIcsOpen(true)}
          disabled={timetable.length === 0}
        >
          <Download className="mr-2 h-4 w-4" />
          ICSをダウンロード
        </Button>
      </div>
      <IcsDownloadDialog
        open={icsOpen}
        onOpenChange={setIcsOpen}
        timetable={timetable}
      />
      <OndemandCourseDialog
        open={ondemandOpen}
        onOpenChange={setOndemandOpen}
      />
    </Card>
  );
}
