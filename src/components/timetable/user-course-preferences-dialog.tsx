"use client";

import { useEffect, useMemo, useState } from "react";
import { useSharedCourseFilters } from "@/components/timetable/course-filter-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import {
  USER_CLASS_OPTIONS,
  USER_COURSE_OPTIONS,
  USER_PROFILE_GRADE_OPTIONS,
  formatResolvedUserCourseProfile,
  resolveUserCourseProfile,
  type UserCourseOption,
  type UserCoursePreferences,
} from "@/lib/user-course-preferences";

type UserCoursePreferencesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function UserCoursePreferencesDialog({
  open,
  onOpenChange,
}: UserCoursePreferencesDialogProps) {
  const {
    selectedAcademicYear,
    userCoursePreferences,
    saveUserCoursePreferences,
  } = useSharedCourseFilters();
  const [draftPreferences, setDraftPreferences] = useState<UserCoursePreferences>(
    userCoursePreferences
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    setDraftPreferences(userCoursePreferences);
  }, [open, userCoursePreferences]);

  const resolvedDraftProfile = useMemo(
    () => resolveUserCourseProfile(draftPreferences, selectedAcademicYear),
    [draftPreferences, selectedAcademicYear]
  );

  const handleSave = () => {
    saveUserCoursePreferences(draftPreferences, { applyToFilters: true });
    toast({
      title: "ユーザー設定を保存しました",
      description: "現在のコースフィルターにも反映しました。",
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>ユーザー設定</DialogTitle>
          <DialogDescription>
            学籍メールから学年とクラスを初期推定します。ここでの設定はコースフィルターにのみ使われ、DBの科目データ自体は変更しません。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="rounded-lg border border-border/70 bg-secondary/20 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{selectedAcademicYear}年度基準</Badge>
              <Badge variant="outline">
                既定フィルター: {formatResolvedUserCourseProfile(resolvedDraftProfile)}
              </Badge>
            </div>
            <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
              <div>
                <div className="text-xs">入学年度</div>
                <div className="font-medium text-foreground">
                  {resolvedDraftProfile.admissionYear
                    ? `${resolvedDraftProfile.admissionYear}年度`
                    : "判定不可"}
                </div>
              </div>
              <div>
                <div className="text-xs">学籍番号末尾</div>
                <div className="font-medium text-foreground">
                  {resolvedDraftProfile.serialNumber
                    ? String(resolvedDraftProfile.serialNumber).padStart(4, "0")
                    : "判定不可"}
                </div>
              </div>
              <div>
                <div className="text-xs">自動判定</div>
                <div className="font-medium text-foreground">
                  {resolvedDraftProfile.resolvedGrade
                    ? `${resolvedDraftProfile.resolvedGrade}年`
                    : "学年未設定"}
                  {resolvedDraftProfile.resolvedClass
                    ? ` / ${resolvedDraftProfile.resolvedClass}クラス`
                    : ""}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="student-email">学籍メール</Label>
            <Input
              id="student-email"
              value={draftPreferences.studentEmail}
              onChange={(event) =>
                setDraftPreferences((currentValue) => ({
                  ...currentValue,
                  studentEmail: event.target.value,
                }))
              }
              placeholder="2512110211h@kindai.ac.jp"
            />
            <p className="text-xs text-muted-foreground">
              先頭2桁を入学年度、末尾4桁をクラス判定の学籍番号として使います。
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="grade-mode">学年</Label>
              <Select
                value={draftPreferences.gradeMode}
                onValueChange={(value) =>
                  setDraftPreferences((currentValue) => ({
                    ...currentValue,
                    gradeMode: value as UserCoursePreferences["gradeMode"],
                    manualGrade:
                      value === "manual"
                        ? currentValue.manualGrade ?? resolvedDraftProfile.resolvedGrade ?? 1
                        : currentValue.manualGrade,
                  }))
                }
              >
                <SelectTrigger id="grade-mode" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">自動判定</SelectItem>
                  <SelectItem value="manual">手動指定</SelectItem>
                </SelectContent>
              </Select>
              {draftPreferences.gradeMode === "manual" && (
                <Select
                  value={String(draftPreferences.manualGrade ?? 1)}
                  onValueChange={(value) =>
                    setDraftPreferences((currentValue) => ({
                      ...currentValue,
                      manualGrade: Number(value),
                    }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="学年を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {USER_PROFILE_GRADE_OPTIONS.map((grade) => (
                      <SelectItem key={grade} value={String(grade)}>
                        {grade}年
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="class-mode">専門科目クラス</Label>
              <Select
                value={draftPreferences.classMode}
                onValueChange={(value) =>
                  setDraftPreferences((currentValue) => ({
                    ...currentValue,
                    classMode: value as UserCoursePreferences["classMode"],
                    manualClass:
                      value === "manual"
                        ? currentValue.manualClass ?? resolvedDraftProfile.resolvedClass ?? "A"
                        : currentValue.manualClass,
                  }))
                }
              >
                <SelectTrigger id="class-mode" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">自動判定</SelectItem>
                  <SelectItem value="manual">手動指定</SelectItem>
                </SelectContent>
              </Select>
              {draftPreferences.classMode === "manual" && (
                <Select
                  value={draftPreferences.manualClass ?? "A"}
                  onValueChange={(value) =>
                    setDraftPreferences((currentValue) => ({
                      ...currentValue,
                      manualClass: value as UserCoursePreferences["manualClass"],
                    }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="クラスを選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {USER_CLASS_OPTIONS.map((classOption) => (
                      <SelectItem key={classOption} value={classOption}>
                        {classOption}クラス
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="course-option">コース</Label>
            <Select
              value={draftPreferences.selectedCourse ?? "none"}
              onValueChange={(value) =>
                setDraftPreferences((currentValue) => ({
                  ...currentValue,
                  selectedCourse:
                    value === "none" ? null : (value as UserCourseOption),
                }))
              }
            >
              <SelectTrigger id="course-option" className="w-full">
                <SelectValue placeholder="コースを選択" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">設定しない</SelectItem>
                {USER_COURSE_OPTIONS.map((courseOption) => (
                  <SelectItem key={courseOption} value={courseOption}>
                    {courseOption}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              コースは2年次以降のフィルターに追加します。1年次は自動では適用しません。
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            キャンセル
          </Button>
          <Button type="button" onClick={handleSave}>
            保存して適用
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}