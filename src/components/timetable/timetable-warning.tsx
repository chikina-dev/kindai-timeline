"use client";

import { useSharedCourseFilters } from "@/components/timetable/course-filter-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

export function TimetableWarning() {
  const { warningMessage } = useSharedCourseFilters();

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