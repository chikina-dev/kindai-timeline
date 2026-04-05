CREATE TABLE "user_course_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"student_email" text NOT NULL,
	"grade_mode" text DEFAULT 'auto' NOT NULL,
	"manual_grade" integer,
	"class_mode" text DEFAULT 'auto' NOT NULL,
	"manual_class" text,
	"selected_course" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "user_course_preferences" ADD CONSTRAINT "user_course_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;