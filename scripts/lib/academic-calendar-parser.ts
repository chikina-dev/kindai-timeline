import { readFileSync } from "node:fs";
import { basename } from "node:path";
import type { DayOfWeek, Semester } from "@/types/course-domain";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PDFParse } = require("pdf-parse");

const DAY_BY_INDEX: DayOfWeek[] = ["日", "月", "火", "水", "木", "金", "土"];
const CLASS_LABEL_PATTERN = /^([月火水木金土日])?\s*([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮])$/;
const CIRCLED_NUMBER_MAP = new Map<string, number>([
  ["①", 1],
  ["②", 2],
  ["③", 3],
  ["④", 4],
  ["⑤", 5],
  ["⑥", 6],
  ["⑦", 7],
  ["⑧", 8],
  ["⑨", 9],
  ["⑩", 10],
  ["⑪", 11],
  ["⑫", 12],
  ["⑬", 13],
  ["⑭", 14],
  ["⑮", 15],
]);

export type ParsedAcademicCalendarSession = {
  academicYear: number;
  semester: Semester;
  actualDate: string;
  actualDay: DayOfWeek;
  effectiveDay: DayOfWeek;
  lectureNumber: number;
  rawLabel: string;
};

export async function parseAcademicCalendarPdf(input: {
  filePath: string;
  academicYear?: number;
}) {
  const buffer = readFileSync(input.filePath);
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText({ disableCombineTextItems: false });
    const text = normalizePdfText(result.text);
    const academicYear =
      input.academicYear ?? inferAcademicYearFromDocument(text, input.filePath);
    const sessions = extractAcademicCalendarSessions(text, academicYear);

    return {
      academicYear,
      sessions,
      sourceFileName: basename(input.filePath),
    };
  } finally {
    await parser.destroy();
  }
}

function extractAcademicCalendarSessions(text: string, academicYear: number) {
  const sessions: ParsedAcademicCalendarSession[] = [];
  let cursor = 0;
  let currentDate = new Date(academicYear, 3, 1);
  const finalDate = new Date(academicYear + 1, 2, 31);

  while (currentDate <= finalDate) {
    const dayToken = String(currentDate.getDate());
    const currentMatch = findDayToken(text, dayToken, cursor);
    if (!currentMatch) {
      throw new Error(
        `Failed to locate day token ${dayToken} for ${formatDate(currentDate)} while parsing annual schedule PDF.`
      );
    }

    const nextDate = addDays(currentDate, 1);
    const nextMatch =
      nextDate <= finalDate
        ? findDayToken(text, String(nextDate.getDate()), currentMatch.end)
        : null;
    const rawLabel = normalizeLabelText(
      text.slice(currentMatch.end, nextMatch?.start ?? text.length)
    );
    const session = toAcademicCalendarSession(currentDate, academicYear, rawLabel);

    if (session) {
      sessions.push(session);
    }

    cursor = nextMatch?.start ?? text.length;
    currentDate = nextDate;
  }

  return sessions;
}

function toAcademicCalendarSession(
  date: Date,
  academicYear: number,
  rawLabel: string
): ParsedAcademicCalendarSession | null {
  const match = rawLabel.match(CLASS_LABEL_PATTERN);
  if (!match) {
    return null;
  }

  const actualDay = DAY_BY_INDEX[date.getDay()];
  const effectiveDay = (match[1] as DayOfWeek | undefined) ?? actualDay;
  const lectureNumber = CIRCLED_NUMBER_MAP.get(match[2]);

  if (!lectureNumber) {
    throw new Error(`Unsupported lecture number label: ${rawLabel}`);
  }

  return {
    academicYear,
    semester: inferSemesterFromSessionDate(date),
    actualDate: formatDate(date),
    actualDay,
    effectiveDay,
    lectureNumber,
    rawLabel,
  };
}

function inferSemesterFromSessionDate(date: Date): Semester {
  const month = date.getMonth() + 1;

  if (month >= 4 && month <= 8) {
    return "前期";
  }

  return "後期";
}

function inferAcademicYearFromDocument(text: string, filePath: string) {
  const match = text.match(/(20\d{2})年/);
  if (!match) {
    throw new Error(
      `Failed to infer academic year from ${basename(filePath)}. Pass --year explicitly.`
    );
  }

  return Number.parseInt(match[1], 10);
}

function normalizePdfText(text: string) {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/（\s+/g, "（")
    .replace(/\s+）/g, "）")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .trim();
}

function normalizeLabelText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function findDayToken(text: string, dayToken: string, fromIndex: number) {
  const pattern = new RegExp(`(?<!\\d)${dayToken}(?!\\d)`, "g");
  pattern.lastIndex = fromIndex;

  for (;;) {
    const match = pattern.exec(text);
    if (!match) {
      return null;
    }

    const before = match.index === 0 ? " " : text[match.index - 1];
    const after = text[match.index + dayToken.length] ?? " ";

    if (isDayBoundaryCharacter(before) && isDayBoundaryCharacter(after)) {
      return {
        start: match.index,
        end: match.index + dayToken.length,
      };
    }
  }
}

function isDayBoundaryCharacter(value: string) {
  return /\s|年|月/.test(value);
}

function addDays(date: Date, dayCount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + dayCount);
  return next;
}

function formatDate(date: Date) {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}