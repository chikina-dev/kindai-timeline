"use client";

import { useTimeTableContext } from "@/components/timetable/timetable-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

export function TimetableWarning() {
  const { warningMessage } = useTimeTableContext();

  if (!warningMessage) {
    return null;
  }

  return (
    <Alert variant="destructive" className="mb-6">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>{warningMessage}</AlertDescription>
    </Alert>
  );
}