"use client";

import { useEffect, useState } from "react";
import { useSharedCourseFilters } from "@/components/timetable/course-filter-provider";
import { ProfileMenu } from "@/components/timetable/profile-menu";
import { useUserTimetable } from "@/hooks/use-timetable";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarDays, BookOpen, GraduationCap, Globe } from "lucide-react";
import type { Session } from "next-auth";
import { SEMESTERS } from "@/types/timetable";

type TimetableHeaderProps = {
  session: Session;
};

export function TimetableHeader({ session }: TimetableHeaderProps) {
  const [hasMounted, setHasMounted] = useState(false);
  const {
    selectedAcademicYear,
    setSelectedAcademicYear,
    availableAcademicYears,
    selectedSemester,
    setSelectedSemester,
  } = useSharedCourseFilters();
  const { totalCredits, timetable } = useUserTimetable({
    academicYear: selectedAcademicYear,
    semester: selectedSemester,
  });

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const categoryCounts = timetable.reduce(
    (acc, course) => {
      acc[course.category] = (acc[course.category] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start justify-between gap-3 lg:justify-start">
          <div className="flex min-w-0 items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center shrink-0">
              <CalendarDays className="w-5 h-5 text-accent-foreground" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-foreground">時間割(情報)</h1>
              <p className="text-sm text-muted-foreground">
                {selectedAcademicYear}年度 {selectedSemester}
              </p>
            </div>
          </div>

          {hasMounted ? (
            <ProfileMenu session={session} buttonClassName="lg:hidden" />
          ) : (
            <div
              aria-hidden="true"
              className="h-10 w-10 shrink-0 rounded-full border border-border/60 bg-background/60 lg:hidden"
            />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 lg:justify-end">
          {hasMounted ? (
            <div className="flex items-center gap-2">
              <Select
                value={String(selectedAcademicYear)}
                onValueChange={(value) => setSelectedAcademicYear(Number(value))}
              >
                <SelectTrigger className="w-28">
                  <SelectValue placeholder="年度" />
                </SelectTrigger>
                <SelectContent>
                  {availableAcademicYears.map((academicYear) => (
                    <SelectItem key={academicYear} value={String(academicYear)}>
                      {academicYear}年度
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={selectedSemester}
                onValueChange={(value) => setSelectedSemester(value as (typeof SEMESTERS)[number])}
              >
                <SelectTrigger className="w-24">
                  <SelectValue placeholder="学期" />
                </SelectTrigger>
                <SelectContent>
                  {SEMESTERS.map((semester) => (
                    <SelectItem key={semester} value={semester}>
                      {semester}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="h-9 min-w-28 justify-center font-normal">
                {selectedAcademicYear}年度
              </Badge>
              <Badge variant="outline" className="h-9 min-w-24 justify-center font-normal">
                {selectedSemester}
              </Badge>
            </div>
          )}

          <div className="hidden md:flex items-center gap-2">
            <Badge
              variant="secondary"
              className="bg-[oklch(0.65_0.18_145/0.2)] text-foreground border-0"
            >
              <GraduationCap className="w-3 h-3 mr-1" />
              専門 {categoryCounts["専門"] || 0}
            </Badge>
            <Badge
              variant="secondary"
              className="bg-[oklch(0.75_0.12_60/0.2)] text-foreground border-0"
            >
              <Globe className="w-3 h-3 mr-1" />
              外国語 {categoryCounts["外国語"] || 0}
            </Badge>
            <Badge
              variant="secondary"
              className="bg-[oklch(0.7_0.15_200/0.2)] text-foreground border-0"
            >
              共通教養 {categoryCounts["共通教養"] || 0}
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="flex items-center gap-1">
              <BookOpen className="w-3 h-3" />
              {timetable.length}科目
            </Badge>
            <Badge variant="outline" className="flex items-center gap-1">
              {totalCredits}単位
            </Badge>
          </div>

          {hasMounted ? (
            <ProfileMenu session={session} buttonClassName="hidden lg:flex" />
          ) : (
            <div
              aria-hidden="true"
              className="hidden h-10 w-10 shrink-0 rounded-full border border-border/60 bg-background/60 lg:block"
            />
          )}
        </div>
      </div>
    </header>
  );
}
