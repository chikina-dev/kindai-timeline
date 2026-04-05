"use client";

import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { buildSyllabusUrl } from "@/lib/syllabus";

type CourseSyllabusLinkProps = {
  syllabusId: string | null | undefined;
  className?: string;
  iconOnly?: boolean;
  label?: string;
};

export function CourseSyllabusLink({
  syllabusId,
  className,
  iconOnly = false,
  label = "シラバス",
}: CourseSyllabusLinkProps) {
  const href = buildSyllabusUrl(syllabusId);

  if (!href) {
    return null;
  }

  return (
    <Button
      asChild
      variant="ghost"
      size={iconOnly ? "icon-sm" : "sm"}
      className={cn(
        "text-muted-foreground hover:text-foreground",
        className
      )}
    >
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        aria-label="シラバスを開く"
        title="シラバスを開く"
        onClick={(event) => event.stopPropagation()}
      >
        <ExternalLink className="h-3.5 w-3.5" />
        {!iconOnly && <span>{label}</span>}
      </a>
    </Button>
  );
}