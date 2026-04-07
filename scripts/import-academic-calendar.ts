import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import {
  academicCalendarSessions,
  type NewAcademicCalendarSession,
} from "@/lib/db/schema";
import { parseAcademicCalendarPdf } from "./lib/academic-calendar-parser";

config({ path: ".env" });

async function main() {
  const args = process.argv.slice(2);
  let academicYear: number | undefined;
  let filePath = resolve(
    process.cwd(),
    "data/pdf/2026年度授業回数表.pdf"
  );
  let outputPath: string | null = resolve(
    process.cwd(),
    "data/academic-calendar-2026.json"
  );
  let dryRun = false;

  if (args.includes("--help") || args.includes("-h")) {
    console.log(
      "Usage: tsx scripts/import-academic-calendar.ts [--file <pdf-path>] [--year <yyyy>] [--out <json-path>] [--dry-run]"
    );
    return;
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--file" && args[index + 1]) {
      filePath = resolve(process.cwd(), args[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--year" && args[index + 1]) {
      academicYear = Number.parseInt(args[index + 1], 10);
      index += 1;
      continue;
    }

    if (arg === "--out" && args[index + 1]) {
      outputPath = resolve(process.cwd(), args[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--no-out") {
      outputPath = null;
      continue;
    }

    if (arg === "--dry-run") {
      dryRun = true;
    }
  }

  const parsed = await parseAcademicCalendarPdf({
    filePath,
    academicYear,
  });
  const records: NewAcademicCalendarSession[] = parsed.sessions.map((session) => ({
    academicYear: session.academicYear,
    semester: session.semester,
    actualDate: session.actualDate,
    actualDay: session.actualDay,
    effectiveDay: session.effectiveDay,
    lectureNumber: session.lectureNumber,
    rawLabel: session.rawLabel,
  }));

  console.log(`Parsed ${records.length} academic calendar sessions from ${filePath}`);
  console.log(
    summarizeSessions(records)
      .map((line) => `  ${line}`)
      .join("\n")
  );

  if (outputPath) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, JSON.stringify(parsed.sessions, null, 2) + "\n", "utf8");
    console.log(`Wrote parsed sessions to ${outputPath}`);
  }

  if (dryRun) {
    return;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  const sql = neon(process.env.DATABASE_URL);
  const db = drizzle({ client: sql });

  const deleted = await db
    .delete(academicCalendarSessions)
    .where(eq(academicCalendarSessions.academicYear, parsed.academicYear))
    .returning({ id: academicCalendarSessions.id });

  const inserted = await db
    .insert(academicCalendarSessions)
    .values(records)
    .returning({ id: academicCalendarSessions.id });

  console.log(`Deleted ${deleted.length} existing sessions for ${parsed.academicYear}`);
  console.log(`Inserted ${inserted.length} academic calendar sessions`);
}

function summarizeSessions(records: NewAcademicCalendarSession[]) {
  const summary = new Map<string, number>();

  for (const record of records) {
    const key = `${record.semester} ${record.effectiveDay}`;
    summary.set(key, (summary.get(key) ?? 0) + 1);
  }

  return Array.from(summary.entries())
    .sort(([left], [right]) => left.localeCompare(right, "ja"))
    .map(([key, count]) => `${key}: ${count}回`);
}

main().catch((error) => {
  console.error("Academic calendar import failed:", error);
  process.exit(1);
});