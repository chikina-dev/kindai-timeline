import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { courses } from "@/lib/db/schema";
import {
  inferAcademicYear,
  inferSemester,
  resolveAcademicYear,
  resolveSemester,
} from "@/lib/academic-term";
import { desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { TimetableHeader } from "@/components/timetable/timetable-header";
import { TimetableGrid } from "@/components/timetable/timetable-grid";
import { TimetableSidebar } from "@/components/timetable/timetable-sidebar";
import { CourseFilterProvider } from "@/components/timetable/course-filter-provider";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ academicYear?: string; semester?: string }>;
}) {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  const [{ academicYear, semester }, academicYearRows] = await Promise.all([
    searchParams,
    db
      .select({ academicYear: courses.academicYear })
      .from(courses)
      .orderBy(desc(courses.academicYear)),
  ]);

  const inferredAcademicYear = inferAcademicYear(new Date());
  const availableAcademicYears = Array.from(
    new Set(academicYearRows.map((row) => row.academicYear))
  );
  const normalizedAcademicYears =
    availableAcademicYears.length > 0
      ? availableAcademicYears
      : [inferredAcademicYear];
  const initialAcademicYear = resolveAcademicYear(
    academicYear,
    normalizedAcademicYears,
    normalizedAcademicYears[0]
  );
  const initialSemester = resolveSemester(semester, inferSemester(new Date()));

  return (
    <div className="min-h-screen bg-background">
      <CourseFilterProvider
        initialAcademicYear={initialAcademicYear}
        availableAcademicYears={normalizedAcademicYears}
        initialSemester={initialSemester}
      >
        <TimetableHeader session={session} />
        <main className="max-w-7xl mx-auto px-4 py-6">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
            <div className="min-w-0 bg-card rounded-xl border border-border overflow-hidden">
              <TimetableGrid />
            </div>
            <aside className="min-w-0 space-y-4 xl:sticky xl:top-24 xl:self-start">
              <TimetableSidebar />
            </aside>
          </div>
        </main>
      </CourseFilterProvider>
      <footer className="border-t border-border py-4 mt-8">
        <div className="max-w-7xl mx-auto px-4">
          <div className="space-y-1 text-center text-sm text-muted-foreground">
            <p>
              非公式かつPDFを簡易的にパースしただけなので精度が不十分である場合があります。公式の時間割を参照してください。(改訂版対応済み)
            </p>
            <p>
              <a
                href="https://x.com/chikina_dev"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4 hover:text-foreground"
              >
                @chikina_dev
              </a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
