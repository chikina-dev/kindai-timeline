import type { Session } from "next-auth";
import { TimetableGrid } from "@/components/timetable/timetable-grid";
import { TimetableHeader } from "@/components/timetable/timetable-header";
import { TimetableSidebar } from "@/components/timetable/timetable-sidebar";
import { TimetableWarning } from "@/components/timetable/timetable-warning";

type TimetablePageProps = {
  session: Session;
};

export function TimetablePage({ session }: TimetablePageProps) {
  return (
    <div className="min-h-screen bg-background">
      <TimetableHeader session={session} />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <TimetableWarning />
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,21rem)] xl:items-start 2xl:grid-cols-[minmax(0,1fr)_23rem]">
          <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
            <TimetableGrid />
          </div>
          <aside className="min-w-0 w-full max-w-none justify-self-stretch space-y-4 xl:sticky xl:top-24 xl:self-start xl:max-w-84 2xl:max-w-92">
            <TimetableSidebar />
          </aside>
        </div>
      </main>
      <footer className="mt-8 border-t border-border py-4">
        <div className="mx-auto max-w-7xl px-4">
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