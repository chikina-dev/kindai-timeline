CREATE TABLE "academic_calendar_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academic_year" integer NOT NULL,
	"semester" text NOT NULL,
	"actual_date" date NOT NULL,
	"actual_day" text NOT NULL,
	"effective_day" text NOT NULL,
	"lecture_number" integer NOT NULL,
	"raw_label" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "academic_calendar_session_academic_year_actual_date_unique" ON "academic_calendar_session" USING btree ("academic_year","actual_date");