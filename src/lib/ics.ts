import type { AcademicCalendarSession, Course } from "@/types/course-records";
import type { DayOfWeek, Semester } from "@/types/course-domain";
import { getPeriodTimeRange } from "@/lib/timetable";

export type IcsRangePreset = "semester" | "thisWeek";

export type IcsTemplateVariable =
  | "academicYear"
  | "category"
  | "className"
  | "classroom"
  | "credits"
  | "day"
  | "department"
  | "features"
  | "instructors"
  | "note"
  | "period"
  | "semester"
  | "title";

export type IcsExportOptions = {
  calendarName?: string;
  now?: Date;
  rangePreset: IcsRangePreset;
  sessions: AcademicCalendarSession[];
  template: string;
};

export type IcsExportResult = {
  content: string;
  fileName: string;
  includedCount: number;
  skippedCount: number;
  sessionCount: number;
};

export const ICS_TEMPLATE_VARIABLES: IcsTemplateVariable[] = [
  "title",
  "day",
  "period",
  "instructors",
  "className",
  "classroom",
  "credits",
  "category",
  "semester",
  "academicYear",
  "department",
  "features",
  "note",
];

export const DEFAULT_ICS_TEMPLATE = "{{ title }}";

type DateRange = {
  end: Date;
  start: Date;
};

type ExportableCourse = Course & {
  day: DayOfWeek;
  periods: number[];
};

export function createTimetableIcs(
  courses: Course[],
  options: IcsExportOptions
): IcsExportResult {
  const now = options.now ?? new Date();
  const academicYear = inferAcademicYear(courses, now);
  const semester = inferSemester(courses, now);
  const range = getRangeFromPreset(options.rangePreset, academicYear, semester, now);
  const dtStamp = formatUtcDateTime(now);
  const calendarName = options.calendarName?.trim() || "近大時間割";
  const sessions = getSessionsInRange(options.sessions, range);

  let includedCount = 0;
  let skippedCount = 0;

  const events = courses
    .flatMap((course) => {
      const exportableCourse = toExportableCourse(course);
      if (!exportableCourse) {
        skippedCount += 1;
        return [];
      }

      const courseEvents = buildEventsForCourse(
        exportableCourse,
        options.template,
        sessions,
        dtStamp
      );

      includedCount += courseEvents.length;
      return courseEvents;
    })
    .sort(compareEventLines);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//kindai-timetable//Timetable Export//JA",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:" + escapeIcsText(calendarName),
    "X-WR-TIMEZONE:Asia/Tokyo",
    ...events.flat(),
    "END:VCALENDAR",
  ];

  return {
    content: `${lines.flatMap(foldIcsLine).join("\r\n")}\r\n`,
    fileName: buildFileName(academicYear, semester, options.rangePreset, now),
    includedCount,
    skippedCount,
    sessionCount: sessions.length,
  };
}

export function getRangeLabel(
  rangePreset: IcsRangePreset,
  academicYear: number,
  semester: Semester
) {
  if (rangePreset === "thisWeek") {
    return "今週のみ";
  }

  return `${academicYear}年度${semester}の授業実施日すべて`;
}

export function renderIcsTemplate(template: string, course: Course): string {
  const variables = getTemplateVariables(course);
  return template.replace(/{{\s*([a-zA-Z]+)\s*}}/g, (placeholder, key) => {
    return key in variables ? variables[key as keyof typeof variables] : placeholder;
  });
}

export function getIcsPreviewText(
  template: string,
  course: Course | undefined,
  fallbackTemplate = DEFAULT_ICS_TEMPLATE
) {
  if (!course) {
    return "";
  }

  return renderIcsTemplate(template || fallbackTemplate, course);
}

function buildEventsForCourse(
  course: ExportableCourse,
  template: string,
  sessions: AcademicCalendarSession[],
  dtStamp: string
) {
  return sessions
    .filter((session) => session.effectiveDay === course.day)
    .map((session) => buildEvent(course, template, session, dtStamp))
    .filter((event): event is string[] => Boolean(event));
}

function buildEvent(
  course: ExportableCourse,
  template: string,
  session: AcademicCalendarSession,
  dtStamp: string
) {
  const periodRange = getPeriodTimeRange(course.periods);
  if (!periodRange) {
    return null;
  }

  const sessionDate = parseDateString(session.actualDate);
  const startsAt = setTime(sessionDate, periodRange.start);
  const endsAt = setTime(sessionDate, periodRange.end);
  const summary = renderIcsTemplate(template, course).trim() || course.name;
  const description = buildDescription(course, session);

  return [
    "BEGIN:VEVENT",
    `UID:${course.id}-${session.actualDate}@kindai-timetable`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${formatLocalDateTime(startsAt)}`,
    `DTEND:${formatLocalDateTime(endsAt)}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `LOCATION:${escapeIcsText(course.classroom ?? "")}`,
    "END:VEVENT",
  ];
}

function buildDescription(
  course: ExportableCourse,
  session: AcademicCalendarSession
) {
  const lines = [
    `科目名: ${course.name}`,
    `授業日: ${formatSessionDateLabel(session)}`,
    `曜日時限: ${session.effectiveDay}${formatPeriodLabel(course.periods)}`,
    `授業回: 第${session.lectureNumber}回`,
    `分類: ${course.category}`,
    `単位: ${course.credits}`,
  ];

  if (session.actualDay !== session.effectiveDay) {
    lines.push(`振替実施: ${session.rawLabel}`);
  }

  if (course.instructors?.length) {
    lines.push(`担当: ${course.instructors.join(", ")}`);
  }

  if (course.className) {
    lines.push(`クラス: ${course.className}`);
  }

  if (course.classroom) {
    lines.push(`教室: ${course.classroom}`);
  }

  if (course.features) {
    lines.push(`形式: ${course.features}`);
  }

  if (course.note) {
    lines.push(`備考: ${course.note}`);
  }

  return lines.join("\n");
}

function buildFileName(
  academicYear: number,
  semester: Semester,
  rangePreset: IcsRangePreset,
  now: Date
) {
  if (rangePreset === "thisWeek") {
    return `kindai-timetable-week-${formatCompactDate(now)}.ics`;
  }

  return `kindai-timetable-${academicYear}-${semester === "前期" ? "spring" : "fall"}.ics`;
}

function getRangeFromPreset(
  rangePreset: IcsRangePreset,
  academicYear: number,
  semester: Semester,
  now: Date
): DateRange {
  if (rangePreset === "thisWeek") {
    const start = startOfWeek(now);
    const end = endOfWeek(now);
    return { start, end };
  }

  return {
    start:
      semester === "前期"
        ? new Date(academicYear, 3, 1, 0, 0, 0)
        : new Date(academicYear, 8, 1, 0, 0, 0),
    end:
      semester === "前期"
        ? new Date(academicYear, 7, 31, 23, 59, 59)
        : new Date(academicYear + 1, 2, 31, 23, 59, 59),
  };
}

function toExportableCourse(course: Course): ExportableCourse | null {
  if (!course.day || !course.periods?.length) {
    return null;
  }

  return {
    ...course,
    day: course.day as DayOfWeek,
    periods: course.periods,
  };
}

function getTemplateVariables(course: Course) {
  return {
    academicYear: String(course.academicYear),
    category: course.category,
    className: course.className ?? "",
    classroom: course.classroom ?? "",
    credits: String(course.credits),
    day: course.day ?? "",
    department: course.department,
    features: course.features ?? "",
    instructors: course.instructors?.join(", ") ?? "",
    note: course.note ?? "",
    period: formatPeriodLabel(course.periods ?? []),
    semester: course.semester,
    title: course.name,
  };
}

function formatPeriodLabel(periods: number[]) {
  if (!periods.length) {
    return "";
  }

  const sortedPeriods = [...periods].sort((left, right) => left - right);
  const first = sortedPeriods[0];
  const last = sortedPeriods[sortedPeriods.length - 1];

  if (first === last) {
    return `${first}限`;
  }

  return `${first}-${last}限`;
}

function inferAcademicYear(courses: Course[], now: Date) {
  const academicYear = courses.find((course) => Number.isInteger(course.academicYear))?.academicYear;
  return academicYear ?? now.getFullYear();
}

function inferSemester(courses: Course[], now: Date): Semester {
  return courses.find((course) => course.semester)?.semester ?? (now.getMonth() + 1 <= 8 ? "前期" : "後期");
}

function getSessionsInRange(
  sessions: AcademicCalendarSession[],
  range: DateRange
) {
  return sessions
    .filter((session) => {
      const date = parseDateString(session.actualDate);
      return date >= range.start && date <= range.end;
    })
    .sort((left, right) => left.actualDate.localeCompare(right.actualDate));
}

function startOfWeek(date: Date) {
  const start = new Date(date);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function endOfWeek(date: Date) {
  const end = startOfWeek(date);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 0);
  return end;
}

function setTime(date: Date, time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const next = new Date(date);
  next.setHours(hours, minutes, 0, 0);
  return next;
}

function parseDateString(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function formatSessionDateLabel(session: AcademicCalendarSession) {
  return `${session.actualDate}(${session.actualDay})`;
}

function formatLocalDateTime(date: Date) {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}T${hours}${minutes}${seconds}`;
}

function formatUtcDateTime(date: Date) {
  const isoString = date.toISOString();
  const [datePart, timePartWithZone] = isoString.split("T");
  const [timePart] = timePartWithZone.split(".");
  return `${datePart.replaceAll("-", "")}T${timePart.replaceAll(":", "")}Z`;
}

function formatCompactDate(date: Date) {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function compareEventLines(left: string[], right: string[]) {
  const leftStart = left.find((line) => line.startsWith("DTSTART:")) ?? "";
  const rightStart = right.find((line) => line.startsWith("DTSTART:")) ?? "";

  if (leftStart !== rightStart) {
    return leftStart.localeCompare(rightStart);
  }

  const leftSummary = left.find((line) => line.startsWith("SUMMARY:")) ?? "";
  const rightSummary = right.find((line) => line.startsWith("SUMMARY:")) ?? "";
  return leftSummary.localeCompare(rightSummary, "ja");
}

function escapeIcsText(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll("\n", "\\n");
}

function foldIcsLine(line: string) {
  if (line.length <= 75) {
    return [line];
  }

  const chunks: string[] = [];
  let rest = line;

  while (rest.length > 75) {
    chunks.push(rest.slice(0, 75));
    rest = ` ${rest.slice(75)}`;
  }

  chunks.push(rest);
  return chunks;
}