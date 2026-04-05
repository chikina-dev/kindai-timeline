export interface RawCourse {
  day: string | null;
  period: number | number[] | null;
  category: string;
  grade: number | number[] | null;
  course: string;
  class: string | null;
  classroom: string | null;
  credits: number;
  instructor: string | string[] | null;
  note: string | null;
  features: string | null;
}

export type Row = string[];
export type Table = Row[];

const DAYS = ["月", "火", "水", "木", "金", "土", "日"];

function parsePeriod(value: string): number | number[] | null {
  const normalized = value.trim();
  if (!normalized || normalized === "-" || normalized === "－") return null;

  const rangeMatch = normalized.match(/^(\d+)[~～](\d+)$/);
  if (rangeMatch) {
    const start = Number.parseInt(rangeMatch[1], 10);
    const end = Number.parseInt(rangeMatch[2], 10);
    const periods: number[] = [];
    for (let current = start; current <= end; current += 1) {
      periods.push(current);
    }
    return periods.length === 1 ? periods[0] : periods;
  }

  const period = Number.parseInt(normalized, 10);
  return Number.isNaN(period) ? null : period;
}

function parseGrade(value: string): number | number[] | null {
  const normalized = value.trim();
  if (!normalized || normalized === "-" || normalized === "－") return null;

  const rangeMatch = normalized.match(/^(\d+)[~～](\d+)$/);
  if (rangeMatch) {
    const start = Number.parseInt(rangeMatch[1], 10);
    const end = Number.parseInt(rangeMatch[2], 10);
    const grades: number[] = [];
    for (let current = start; current <= end; current += 1) {
      grades.push(current);
    }
    return grades.length === 1 ? grades[0] : grades;
  }

  const grade = Number.parseInt(normalized, 10);
  return Number.isNaN(grade) ? null : grade;
}

function parseInstructors(value: string): string | string[] | null {
  const normalized = value
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*[－-]\s*$/, "")
    .trim();

  if (!normalized || normalized === "-") return null;

  const instructors = normalized
    .split(/[，,、]/)
    .map((instructor) => instructor.trim())
    .filter(Boolean);

  if (instructors.length === 0) return null;
  return instructors.length === 1 ? instructors[0] : instructors;
}

function parseNote(value: string): string | null {
  const normalized = value.replace(/\n/g, " ").trim();
  if (!normalized || normalized === "-") return null;
  return normalized;
}

function extractFeatures(note: string | null): string | null {
  if (!note) return null;
  if (note.includes("メディア授業")) return "メディア授業";
  return null;
}

function parseClassName(value: string): string | null {
  const normalized = value.trim();
  if (!normalized || normalized === "-") return null;
  return normalized.replace(/^[（(](.+)[）)]$/, "$1") || null;
}

function normalizeMediaLabel(value: string): string {
  return value.replace(/メ\s*デ\s*ィ\s*ア\s*授\s*業/g, "メディア授業");
}

function normalizeCompactText(value: string): string {
  return normalizeMediaLabel(value)
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCourseText(value: string): string {
  return normalizeMediaLabel(value)
    .replace(/\s+/g, "")
    .replace(/^[－-]+/, "")
    .replace(/^\d+【メディア授業】/, "")
    .replace(/^【メディア授業】/, "")
    .trim();
}

function parseClassroom(value: string): string | null {
  const normalized = normalizeCompactText(value);
  if (!normalized || normalized === "-" || normalized === "－") return null;

  // Google Docs export sometimes concatenates bracketed rooms like
  // "【E-405】【E-305】"; normalize that into a plain delimited list.
  const bracketNormalized = normalized
    .replace(/^【(.+)】$/, "$1")
    .replace(/】\s*【/g, ", ")
    .replace(/^[【】\s]+|[【】\s]+$/g, "")
    .replace(/\s*,\s*/g, ", ")
    .trim();

  return bracketNormalized || null;
}

function splitGradeAndCourseCell(value: string): { grade: string; course: string } | null {
  const normalized = normalizeCompactText(value);
  const match = normalized.match(/^(\d+(?:[~～]\d+)?)\s+(.+)$/);
  if (!match) return null;
  return {
    grade: match[1],
    course: match[2].trim(),
  };
}

function reconstructSparseBaseRow(
  row: Row,
  currentDay: string,
  currentPeriod: string
): Row | null {
  if (
    row.length !== 10 ||
    row[0] ||
    row[1] ||
    !isCategory(row[2]) ||
    row[4] ||
    row[5] ||
    !row[6]
  ) {
    return null;
  }

  const split = splitGradeAndCourseCell(row[3] || "");
  if (!split) return null;

  return [
    currentDay,
    currentPeriod,
    row[2],
    split.grade,
    split.course,
    "",
    row[6],
    row[7] || "",
    row[8] || "",
    row[9] || "",
  ];
}

function splitCourseAndEmbeddedNote(course: string): {
  course: string;
  embeddedNote: string | null;
} {
  const noteStartPatterns = ["履修登録は", "※情報処理実習", "※23年以前", "※25年以前"];

  for (const pattern of noteStartPatterns) {
    const noteIndex = course.indexOf(pattern);
    if (noteIndex > 0) {
      return {
        course: course.slice(0, noteIndex).trim(),
        embeddedNote: course.slice(noteIndex).trim(),
      };
    }
  }

  return { course, embeddedNote: null };
}

function appendNote(existingNote: string | null, extraNote: string | null): string | null {
  const normalizedExisting = existingNote?.trim() || null;
  const normalizedExtra = extraNote?.trim() || null;

  if (!normalizedExtra) return normalizedExisting;
  if (!normalizedExisting) return normalizedExtra;
  if (normalizedExisting.includes(normalizedExtra)) return normalizedExisting;

  return `${normalizedExisting} ${normalizedExtra}`;
}

function isPeriodLike(value: string): boolean {
  return /^\d+([~～]\d+)?$/.test(value.trim());
}

function isDay(value: string): boolean {
  return DAYS.includes(value.trim());
}

function looksLikeNote(value: string): boolean {
  return /(メディア授業|履修|受講|合同|回のみ|クラス|利用|ガイダンス|不開講|調整|読み替え|オンデマンド|集中講義)/.test(
    value
  );
}

function isCategory(value: string): boolean {
  return ["共通教養", "専門", "外国語"].includes(value.trim());
}

function compareCourseOrder(left: RawCourse, right: RawCourse): number {
  const leftDay = left.day ? DAYS.indexOf(left.day) : Number.MAX_SAFE_INTEGER;
  const rightDay = right.day ? DAYS.indexOf(right.day) : Number.MAX_SAFE_INTEGER;
  if (leftDay !== rightDay) return leftDay - rightDay;

  const leftPeriod = Array.isArray(left.period)
    ? (left.period[0] ?? Number.MAX_SAFE_INTEGER)
    : (left.period ?? Number.MAX_SAFE_INTEGER);
  const rightPeriod = Array.isArray(right.period)
    ? (right.period[0] ?? Number.MAX_SAFE_INTEGER)
    : (right.period ?? Number.MAX_SAFE_INTEGER);

  if (leftPeriod !== rightPeriod) return leftPeriod - rightPeriod;
  return 0;
}

function inferCreditsFromCourse(course: RawCourse): number {
  const normalizedCourse = normalizeCourseText(course.course);

  if (
    course.category === "外国語" ||
    /アカデミックイングリッシュ|英語総合|中国語総合|韓国語総合|オーラルイングリッシュ|TOEIC/.test(
      normalizedCourse
    )
  ) {
    return 1;
  }

  if (/社会情報学実習/.test(normalizedCourse)) {
    return 1;
  }

  if (/情報学応用ゼミナール/.test(normalizedCourse)) {
    return 2;
  }

  if (/キャリアデザイン/.test(normalizedCourse)) {
    return 3;
  }

  return 0;
}

function inferFeatureForNullDayCourse(course: RawCourse): string {
  const normalizedCourse = normalizeCourseText(course.course);
  const normalizedNote = normalizeCompactText(course.note ?? "");

  if (course.features) {
    return course.features;
  }

  if (normalizedNote.includes("KICSオンデマンド")) {
    return "KICSオンデマンド";
  }

  if (/社会情報学実習[３3４4]/.test(normalizedCourse)) {
    return "専門科目オンデマンド";
  }

  return "KICSオンデマンド";
}

function parseMergedBlob(text: string): {
  course: string;
  class: string | null;
  classroom: string | null;
  credits: number;
  instructor: string | string[] | null;
  note: string | null;
  features: string | null;
} | null {
  const normalized = text.replace(/\n/g, " ").trim();
  if (!normalized) return null;

  const classPattern = normalized.match(
    /^(.+?)\s+[（(]([^）)]+)[）)]\s+(\d+)\s+(.+?)(?:\s+-\s*(.*))?$/
  );
  if (classPattern) {
    const noteText = classPattern[5]?.trim() || null;
    return {
      course: classPattern[1].trim(),
      class: classPattern[2].trim(),
      classroom: null,
      credits: Number.parseInt(classPattern[3], 10),
      instructor: parseInstructors(classPattern[4].replace(/\s*-\s*$/, "").trim()),
      note: noteText && noteText !== "-" ? noteText : null,
      features: noteText?.includes("メディア授業") ? "メディア授業" : null,
    };
  }

  const simplePattern = normalized.match(/^(.+?)\s+-\s+(\d+)\s+(.+?)(?:\s+([※【].*))?$/);
  if (simplePattern) {
    const noteText = simplePattern[4]?.trim() || null;
    return {
      course: simplePattern[1].trim(),
      class: null,
      classroom: null,
      credits: Number.parseInt(simplePattern[2], 10),
      instructor: parseInstructors(simplePattern[3].trim()),
      note: noteText,
      features: noteText?.includes("メディア授業") ? "メディア授業" : null,
    };
  }

  return null;
}

function parseMultiLineMergedBlob(
  text: string,
  category: string,
  gradeStr: string,
  day: string,
  period: string
): RawCourse[] {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 3) return [];

  const courses: RawCourse[] = [];
  let courseName: string | null = null;
  let credits = 0;
  let features: string | null = null;
  let note: string | null = null;
  let classInstructorLines: string[] = [];

  const lastLine = lines[lines.length - 1];
  if (!/^[（(]/.test(lastLine) && !/^\d+$/.test(lastLine)) {
    courseName = lastLine;
    let currentIndex = lines.length - 2;

    if (currentIndex >= 0 && /^\d+$/.test(lines[currentIndex])) {
      credits = Number.parseInt(lines[currentIndex], 10);
      currentIndex -= 1;
    }

    if (currentIndex >= 0 && /【.+】/.test(lines[currentIndex])) {
      note = lines[currentIndex].replace(/【メディア授業】/, "").trim() || null;
      features = lines[currentIndex].includes("メディア授業") ? "メディア授業" : null;
      currentIndex -= 1;
    }

    classInstructorLines = lines.slice(0, currentIndex + 1);
  }

  if (!courseName) return [];

  const merged = classInstructorLines.join(" ");
  const classEntries = merged.split(/(?=[（(])/).filter(Boolean);

  for (const entry of classEntries) {
    const classMatch = entry.match(/^[（(]([^）)]+)[）)]\s*(.*)/);
    if (!classMatch) continue;

    const className = classMatch[1].trim();
    let instructorText = classMatch[2].trim().replace(/\s*-\s*$/, "").trim();
    let blockCredits = credits;

    const creditsMatch = instructorText.match(/^(\d+)\s+(.*)$/s);
    if (creditsMatch) {
      blockCredits = Number.parseInt(creditsMatch[1], 10);
      instructorText = creditsMatch[2].trim();
    }

    if (!instructorText) continue;

    courses.push({
      day: isDay(day) ? day : null,
      period: parsePeriod(period),
      category,
      grade: parseGrade(gradeStr),
      course: courseName,
      class: className,
      classroom: null,
      credits: blockCredits || credits,
      instructor: parseInstructors(instructorText),
      note,
      features,
    });
  }

  return courses;
}

function looksLikePlaceholderSubclassRow(row: Row): boolean {
  return (
    row.length === 10 &&
    !row[0] &&
    !row[1] &&
    !row[2] &&
    !row[3] &&
    !row[4] &&
    Boolean(row[5]) &&
    !row[6] &&
    Boolean(row[7]) &&
    Boolean(row[8])
  );
}

function toPlaceholderSubclassRow(row: Row): Row {
  return [row[5] || "", row[6] || "", row[7] || "", row[8] || ""];
}

function normalizeRow(
  row: Row,
  currentDay: string,
  currentPeriod: string
): { normalized: Row; day: string; period: string } | null {
  const workingRow = [...row];
  while (workingRow.length > 10 && workingRow[workingRow.length - 1] === "") {
    workingRow.pop();
  }

  const length = workingRow.length;

  if (length === 10) {
    const reconstructed = reconstructSparseBaseRow(workingRow, currentDay, currentPeriod);
    if (reconstructed) {
      return { normalized: reconstructed, day: currentDay, period: currentPeriod };
    }

    if (isCategory(workingRow[2]) && !workingRow[4] && workingRow[6]) {
      const split = splitGradeAndCourseCell(workingRow[3] || "");
      if (split) {
        const day = isDay(workingRow[0]) ? workingRow[0] : currentDay;
        const period = isPeriodLike(workingRow[1]) ? workingRow[1] : currentPeriod;
        return {
          normalized: [
            day,
            period,
            workingRow[2],
            split.grade,
            split.course,
            workingRow[5],
            workingRow[6],
            workingRow[7] || "",
            workingRow[8] || "",
            workingRow[9] || "",
          ],
          day,
          period,
        };
      }
    }

    const day = isDay(workingRow[0]) ? workingRow[0] : currentDay;
    const period = isPeriodLike(workingRow[1]) ? workingRow[1] : currentPeriod;
    return { normalized: workingRow, day, period };
  }

  if (length === 9) {
    if (isDay(workingRow[0]) && isCategory(workingRow[2])) {
      const day = workingRow[0];
      const period = isPeriodLike(workingRow[1]) ? workingRow[1] : currentPeriod;
      return {
        normalized: [
          workingRow[0],
          workingRow[1],
          workingRow[2],
          workingRow[3],
          workingRow[4],
          workingRow[5],
          workingRow[6],
          workingRow[7],
          "",
          workingRow[8],
        ],
        day,
        period,
      };
    }

    if (isCategory(workingRow[1])) {
      const period = isPeriodLike(workingRow[0]) ? workingRow[0] : currentPeriod;
      return {
        normalized: [currentDay, ...workingRow],
        day: currentDay,
        period,
      };
    }

    const day = isDay(workingRow[0]) ? workingRow[0] : currentDay;
    const period = isPeriodLike(workingRow[1]) ? workingRow[1] : currentPeriod;
    return {
      normalized: [
        day,
        workingRow[1],
        workingRow[2],
        workingRow[3],
        workingRow[4],
        workingRow[5],
        workingRow[6],
        workingRow[7],
        "",
        workingRow[8] ?? "",
      ],
      day,
      period,
    };
  }

  if (length === 8) {
    const firstColumn = workingRow[0].trim();
    return {
      normalized: [currentDay, ...workingRow.slice(0, 7), "", workingRow[7]],
      day: currentDay,
      period: isPeriodLike(firstColumn) ? firstColumn : currentPeriod,
    };
  }

  if (length === 7) {
    if (isCategory(workingRow[0])) {
      return {
        normalized: [currentDay, currentPeriod, ...workingRow.slice(0, 6), "", workingRow[6]],
        day: currentDay,
        period: currentPeriod,
      };
    }
    return null;
  }

  if (length === 6) {
    if (isCategory(workingRow[0])) {
      return {
        normalized: [currentDay, currentPeriod, ...workingRow, "", ""],
        day: currentDay,
        period: currentPeriod,
      };
    }
    return null;
  }

  if (length === 4) {
    if (isPeriodLike(workingRow[0]) && isCategory(workingRow[1])) {
      return {
        normalized: [
          "__MERGED__",
          workingRow[0],
          workingRow[1],
          workingRow[2],
          workingRow[3],
          "",
          "",
          "",
          "",
          "",
        ],
        day: currentDay,
        period: workingRow[0],
      };
    }

    if (isPeriodLike(workingRow[0]) && workingRow[3]?.includes("アセンブリ")) {
      return {
        normalized: ["__SKIP__", workingRow[0], "", "", "", "", "", "", "", ""],
        day: currentDay,
        period: workingRow[0],
      };
    }
  }

  return null;
}

function attachSubClassRow(baseCourse: RawCourse, row: Row, courses: RawCourse[]): RawCourse | null {
  const className = parseClassName(row[0]);
  const instructor = parseInstructors(row[2]);
  const classroom = parseClassroom(row[3] || "");

  if (className && instructor) {
    const subCourse: RawCourse = {
      ...baseCourse,
      class: className,
      classroom: classroom ?? baseCourse.classroom,
      instructor,
      credits:
        row[1].trim() && !Number.isNaN(Number.parseInt(row[1], 10))
          ? Number.parseInt(row[1], 10)
          : baseCourse.credits,
    };

    courses.push(subCourse);
    return subCourse;
  }

  if (className) {
    const subCourse: RawCourse = {
      ...baseCourse,
      class: className,
      classroom: classroom ?? baseCourse.classroom,
    };

    courses.push(subCourse);
    return subCourse;
  }

  return null;
}

function trimTrailingEmptyColumns(row: Row): Row {
  const trimmed = [...row];
  while (trimmed.length > 0 && trimmed[trimmed.length - 1] === "") {
    trimmed.pop();
  }
  return trimmed;
}

export function parseCourseTables(tables: Table[]): RawCourse[] {
  const courses: RawCourse[] = [];
  let currentDay = "";
  let currentPeriod = "";
  let lastCourse: RawCourse | null = null;
  let currentBaseCourse: RawCourse | null = null;
  let lastPeriodKey = "";
  let pendingSubClassRows: Row[] = [];
  let inMergedSection = false;

  for (const table of tables) {
    if (table.every((row) => row.every((cell) => !cell.trim()))) {
      continue;
    }

    for (const sourceRow of table) {
      const row = trimTrailingEmptyColumns(sourceRow.map((cell) => cell ?? ""));
      const joined = row.join(" ").replace(/\s+/g, " ").trim();

      if (!joined) continue;
      if (joined.includes("令和8年度時間割")) continue;
      if (joined.startsWith("曜日 時限")) continue;
      if (/^\d+\s*ページ$/.test(joined)) continue;
      if (row[0] === "曜日") continue;

      if (row.length >= 8 && isDay(row[0])) {
        inMergedSection = false;
      }

      if (looksLikePlaceholderSubclassRow(row)) {
        pendingSubClassRows.push(toPlaceholderSubclassRow(row));
        continue;
      }

      if (row.length === 3 || (row.length === 4 && !isPeriodLike(row[0]))) {
        if (inMergedSection && isCategory(row[0])) {
          const blobText = row[2];

          if (blobText.includes("\n") && /[（(]/.test(blobText)) {
            const parsed = parseMultiLineMergedBlob(
              blobText,
              row[0],
              row[1],
              currentDay,
              currentPeriod
            );

            for (const course of parsed) {
              courses.push(course);
              lastCourse = course;
            }
          } else {
            const parsed = parseMergedBlob(blobText);
            if (parsed) {
              const course: RawCourse = {
                day: isDay(currentDay) ? currentDay : null,
                period: parsePeriod(currentPeriod),
                category: row[0].trim(),
                grade: parseGrade(row[1]),
                course: parsed.course,
                class: parsed.class,
                classroom: parsed.classroom,
                credits: parsed.credits,
                instructor: parsed.instructor,
                note: parsed.note,
                features: parsed.features,
              };
              courses.push(course);
              lastCourse = course;
            }
          }
          continue;
        }

        pendingSubClassRows.push(row);
        continue;
      }

      if (row.length === 1) {
        const text = row[0].trim();
        if (!text) continue;

        if (isDay(text)) {
          currentDay = text;
          currentPeriod = "";
          lastCourse = null;
          currentBaseCourse = null;
          pendingSubClassRows = [];
          continue;
        }

        if (/^[（(].*[）)]$/.test(text) && lastCourse) {
          courses.push({
            ...lastCourse,
            class: parseClassName(text),
          });
          continue;
        }

        if (looksLikeNote(text) && lastCourse) {
          lastCourse.note = lastCourse.note ? `${lastCourse.note} ${text}` : text;
          lastCourse.features = extractFeatures(lastCourse.note);
          continue;
        }

        if (lastCourse) {
          const existingInstructors = Array.isArray(lastCourse.instructor)
            ? lastCourse.instructor
            : lastCourse.instructor
              ? [lastCourse.instructor]
              : [];
          const newInstructors = parseInstructors(text);
          if (newInstructors) {
            const flattened = Array.isArray(newInstructors) ? newInstructors : [newInstructors];
            lastCourse.instructor = [...existingInstructors, ...flattened];
          }
        }
        continue;
      }

      const normalizedResult = normalizeRow(row, currentDay, currentPeriod);
      if (!normalizedResult) continue;

      const { normalized, day, period } = normalizedResult;
      currentDay = day;
      currentPeriod = period;

      if (normalized[0] === "__SKIP__") {
        inMergedSection = true;
        continue;
      }

      if (normalized[0] === "__MERGED__") {
        inMergedSection = true;

        const mergedCategory = normalized[2];
        const mergedGrade = normalized[3];
        const mergedText = normalized[4];

        if (mergedText.includes("\n") && /[（(]/.test(mergedText)) {
          const parsed = parseMultiLineMergedBlob(
            mergedText,
            mergedCategory,
            mergedGrade,
            currentDay,
            currentPeriod
          );

          for (const course of parsed) {
            courses.push(course);
            lastCourse = course;
          }
        } else {
          const parsed = parseMergedBlob(mergedText);
          if (parsed) {
            const course: RawCourse = {
              day: isDay(currentDay) ? currentDay : null,
              period: parsePeriod(currentPeriod),
              category: mergedCategory,
              grade: parseGrade(mergedGrade),
              course: parsed.course,
              class: parsed.class,
              classroom: parsed.classroom,
              credits: parsed.credits,
              instructor: parsed.instructor,
              note: parsed.note,
              features: parsed.features,
            };
            courses.push(course);
            lastCourse = course;
          }
        }
        continue;
      }

      const [, periodStr, category, gradeStr, courseName, classStr, creditsStr, instructorStr, classroomStr, noteStr] =
        normalized;
      const creditsAndInstructorMatch = creditsStr.match(/^(\d+)\s+(.+)$/);
      const parsedCreditsText = creditsAndInstructorMatch?.[1] ?? creditsStr;
      const reconstructedInstructor = creditsAndInstructorMatch?.[2]
        ? normalizeCompactText(`${creditsAndInstructorMatch[2]} ${instructorStr}`)
        : instructorStr;

      if (!courseName || !category) continue;
      if (!isCategory(category)) continue;

      let repairedClassroom = classroomStr || "";
      let repairedNote = noteStr || "";

      if (repairedClassroom && !repairedClassroom.endsWith("】") && repairedNote.startsWith("】")) {
        repairedClassroom = `${repairedClassroom}】`;
        repairedNote = repairedNote.slice(1).trim();
      }

      const note = parseNote(repairedNote || "");
      const course: RawCourse = {
        day: isDay(currentDay) ? currentDay : null,
        period: parsePeriod(periodStr),
        category,
        grade: parseGrade(gradeStr),
        course: courseName.trim(),
        class: parseClassName(classStr || ""),
        classroom: parseClassroom(repairedClassroom || ""),
        credits: Number.parseInt(parsedCreditsText, 10) || 0,
        instructor: parseInstructors(reconstructedInstructor || ""),
        note: note?.replace(/【メディア授業】\s*/, "").trim() || null,
        features: extractFeatures(note),
      };

      courses.push(course);
      lastCourse = course;

      const periodKey = `${currentDay}:${currentPeriod}`;
      if (periodKey !== lastPeriodKey && pendingSubClassRows.length > 0) {
        if (currentBaseCourse) {
          for (const pending of pendingSubClassRows) {
            attachSubClassRow(currentBaseCourse, pending, courses);
          }
        }
        pendingSubClassRows = [];
      }
      lastPeriodKey = periodKey;

      if (pendingSubClassRows.length > 0) {
        for (const pending of pendingSubClassRows) {
          attachSubClassRow(course, pending, courses);
        }
        pendingSubClassRows = [];
      }

      currentBaseCourse = course;
    }
  }

  if (pendingSubClassRows.length > 0 && currentBaseCourse) {
    for (const pending of pendingSubClassRows) {
      attachSubClassRow(currentBaseCourse, pending, courses);
    }
  }

  for (const course of courses) {
    if (course.note === "") {
      course.note = null;
    }
  }

  for (const course of courses) {
    const originalCourse = course.course;
    const inferredCredit = originalCourse.match(/^\s*(\d+)\s*【メディア授業】/)?.[1];
    const normalizedCourse = normalizeCourseText(originalCourse);
    const splitResult = splitCourseAndEmbeddedNote(normalizedCourse);

    course.course = splitResult.course;
    course.class = course.class ? normalizeCompactText(course.class) : null;
    course.classroom = course.classroom ? normalizeCompactText(course.classroom) : null;
    course.note = course.note ? normalizeCompactText(course.note) : null;
    course.features = course.features ? normalizeCompactText(course.features) : null;

    if (splitResult.embeddedNote) {
      course.note = course.note
        ? `${splitResult.embeddedNote} ${course.note}`
        : splitResult.embeddedNote;
    }

    if (Array.isArray(course.instructor)) {
      course.instructor = course.instructor.map((instructor) => normalizeCompactText(instructor));
    } else if (course.instructor) {
      course.instructor = normalizeCompactText(course.instructor);
    }

    if (course.note) {
      course.note = course.note.replace(/^【メディア授業】\s*/, "").trim() || null;
      if (course.note && course.note.endsWith("-")) {
        course.note = course.note.replace(/\s*-\s*$/, "").trim() || null;
      }
    }

    if (course.classroom) {
      const classroomWithoutDash = course.classroom.replace(/\s*[-－]\s*$/, "").trim();

      // Some rows do not have a classroom and this column contains guidance text.
      // Keep such text in note instead of polluting instructor/classroom.
      if (looksLikeNote(classroomWithoutDash)) {
        course.note = appendNote(course.note, classroomWithoutDash);
        course.classroom = null;
        continue;
      }

      const classroomMatch = classroomWithoutDash.match(
        /(?:記念会館|[A-Z]-\d{3}(?:他)?(?:[，,、 ]\d{3})*|[A-Z]-\d{3}】【[A-Z]-\d{3}|\d-\d{3})/
      );

      if (classroomMatch) {
        const leadingText = classroomWithoutDash.slice(0, classroomMatch.index).trim();
        if (leadingText) {
          if (Array.isArray(course.instructor) && course.instructor.length > 0) {
            const instructors = [...course.instructor];
            instructors[instructors.length - 1] = normalizeCompactText(
              `${instructors[instructors.length - 1]} ${leadingText}`
            );
            course.instructor = instructors;
          } else if (typeof course.instructor === "string" && course.instructor) {
            course.instructor = normalizeCompactText(`${course.instructor} ${leadingText}`);
          }
        }

        course.classroom = classroomWithoutDash.slice(classroomMatch.index).trim() || null;
      } else if (/^[^A-Z\d]+$/.test(classroomWithoutDash.replace(/[\s,，、]/g, ""))) {
        course.note = appendNote(course.note, classroomWithoutDash);
        course.classroom = null;
      }
    }

    if (
      (!course.features || course.features === "") &&
      ((typeof course.note === "string" && course.note.includes("メディア授業")) ||
        originalCourse.includes("メディア授業"))
    ) {
      course.features = "メディア授業";
    }

    if (course.credits === 0 && inferredCredit) {
      course.credits = Number.parseInt(inferredCredit, 10);
    }
  }

  const creditsByName = new Map<string, number>();
  for (const course of courses) {
    if (course.credits > 0) {
      const previous = creditsByName.get(course.course) ?? 0;
      creditsByName.set(course.course, Math.max(previous, course.credits));
    }
  }

  for (const course of courses) {
    if (course.credits === 0) {
      course.credits = creditsByName.get(course.course) ?? 0;
    }
    if (course.credits === 0) {
      course.credits = inferCreditsFromCourse(course);
    }
  }

  for (const course of courses) {
    if (course.period === null) {
      course.day = null;
    }
  }

  for (const course of courses) {
    if (course.day === null) {
      course.features = inferFeatureForNullDayCourse(course);
    }
  }

  return courses
    .map((course, index) => ({ course, index }))
    .sort((left, right) => {
      const order = compareCourseOrder(left.course, right.course);
      return order !== 0 ? order : left.index - right.index;
    })
    .map(({ course }) => course);
}