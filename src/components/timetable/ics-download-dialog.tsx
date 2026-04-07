"use client";

import { useState } from "react";
import { CalendarRange, Download } from "lucide-react";
import { useAcademicCalendarSessions } from "@/hooks/use-timetable";
import {
  createTimetableIcs,
  getRangeLabel,
  ICS_TEMPLATE_VARIABLES,
  renderIcsTemplate,
  type IcsRangePreset,
} from "@/lib/ics";
import type { Course } from "@/types/course-records";
import type { Semester } from "@/types/course-domain";
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
import { IcsTemplateEditor } from "./ics-template-editor";

const DEFAULT_TEMPLATE = "{{ title }}";

type IcsDownloadDialogProps = {
  academicYear: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  semester: Semester;
  timetable: Course[];
};

export function IcsDownloadDialog({
  academicYear,
  open,
  onOpenChange,
  semester,
  timetable,
}: IcsDownloadDialogProps) {
  const [rangePreset, setRangePreset] = useState<IcsRangePreset>("semester");
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [calendarName, setCalendarName] = useState("近大時間割");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const scheduledCount = timetable.filter(
    (course) => course.day && course.periods?.length
  ).length;
  const unscheduledCount = timetable.length - scheduledCount;
  const firstCourse = timetable[0];
  const {
    data: academicCalendarSessions = [],
    error: academicCalendarError,
    isLoading: isAcademicCalendarLoading,
  } = useAcademicCalendarSessions(
    {
      academicYear,
      semester,
    },
    {
      enabled: open && scheduledCount > 0,
    }
  );
  const previewText = firstCourse
    ? renderIcsTemplate(template || DEFAULT_TEMPLATE, firstCourse)
    : "";

  const handleDownload = () => {
    const trimmedTemplate = template.trim();
    if (!trimmedTemplate) {
      setErrorMessage("表示テキストを入力してください");
      return;
    }

    setErrorMessage(null);

    if (academicCalendarSessions.length === 0) {
      setErrorMessage("選択中の年度・学期の授業日データがありません");
      return;
    }

    const result = createTimetableIcs(timetable, {
      calendarName,
      rangePreset,
      sessions: academicCalendarSessions,
      template: trimmedTemplate,
    });

    if (result.includedCount === 0) {
      setErrorMessage("選択した期間に出力できる授業イベントがありません");
      return;
    }

    const blob = new Blob([result.content], {
      type: "text/calendar;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = result.fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-160 max-h-[85vh] flex! flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarRange className="h-5 w-5" />
            ICSをダウンロード
          </DialogTitle>
          <DialogDescription>
            年間行事予定の授業日データを使って、休講日と振替授業日を反映したICSを出力します。
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          <div className="space-y-5">
            <div className="grid gap-2">
              <Label htmlFor="ics-range">期間</Label>
              <Select
                value={rangePreset}
                onValueChange={(value) => setRangePreset(value as IcsRangePreset)}
              >
                <SelectTrigger id="ics-range" className="w-full">
                  <SelectValue placeholder="期間を選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="semester">
                    4月から7月末まで
                  </SelectItem>
                  <SelectItem value="thisWeek">今週のみ</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                現在の設定: {getRangeLabel(rangePreset, academicYear, semester)}
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="ics-calendar-name">カレンダー名</Label>
              <Input
                id="ics-calendar-name"
                value={calendarName}
                onChange={(event) => setCalendarName(event.target.value)}
                placeholder="近大時間割"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="ics-template">表示テキスト</Label>
              <IcsTemplateEditor
                value={template}
                onChange={setTemplate}
                placeholder="{{ title }}"
                variables={ICS_TEMPLATE_VARIABLES}
              />
              <p className="text-xs text-muted-foreground">
                {"例: {{ title }} / {{ className }} / {{ instructors }}"}
                {"  装飾は編集用で、ICS出力時はプレーンテキストになります。"}
              </p>
              {firstCourse && (
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                  プレビュー: {previewText || firstCourse.name}
                </p>
              )}
            </div>

            <div className="rounded-lg border border-border p-3 space-y-1 text-sm">
              <p>出力対象: {scheduledCount}科目</p>
              <p className="text-muted-foreground">
                授業日データ: {isAcademicCalendarLoading ? "読み込み中" : `${academicCalendarSessions.length}件`}
              </p>
              <p className="text-muted-foreground">
                曜日や時限が未設定の科目 {unscheduledCount} 件はICSに含まれません。
              </p>
              {academicCalendarError && (
                <p className="text-destructive">
                  授業日データの取得に失敗しました。しばらくしてから再度お試しください。
                </p>
              )}
              {!isAcademicCalendarLoading &&
                !academicCalendarError &&
                academicCalendarSessions.length === 0 && (
                  <p className="text-destructive">
                    この年度・学期の授業日データが未登録です。先に import script を実行してください。
                  </p>
                )}
            </div>

            {errorMessage && (
              <p className="text-sm text-destructive">{errorMessage}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            キャンセル
          </Button>
          <Button
            onClick={handleDownload}
            disabled={
              scheduledCount === 0 ||
              isAcademicCalendarLoading ||
              academicCalendarSessions.length === 0
            }
          >
            <Download className="mr-2 h-4 w-4" />
            ダウンロード
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}