import type { Session } from "next-auth";
import { TimetableGrid } from "@/components/timetable/timetable-grid";
import { TimetableHeader } from "@/components/timetable/timetable-header";
import { TimetableSidebar } from "@/components/timetable/timetable-sidebar";
import { useTimeTableContext } from "@/components/timetable/timetable-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

type TimetablePageProps = {
  session: Session;
};

export function TimetablePage({ session }: TimetablePageProps) {
  const { warningMessage } = useTimeTableContext();

  return (
    <div className="min-h-screen bg-background">
      <TimetableHeader session={session} />
      <main className="mx-auto max-w-7xl px-4 py-6">
        {warningMessage && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{warningMessage}</AlertDescription>
          </Alert>
        )}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
          <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
            <TimetableGrid />
          </div>
          <aside className="min-w-0 w-[min(100%,320px)] justify-self-start space-y-4 xl:sticky xl:top-24 xl:self-start">
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