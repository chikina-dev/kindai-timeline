import {
  date,
  pgTable,
  text,
  timestamp,
  integer,
  primaryKey,
  uuid,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "@auth/core/adapters";
import type {
  Category,
  DayOfWeek,
  Feature,
  Requirement,
  Semester,
} from "@/types/course-domain";

// ============================================================
// Auth.js tables (DrizzleAdapter準拠)
// ============================================================

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => ({
    compositePk: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  })
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (verificationToken) => ({
    compositePk: primaryKey({
      columns: [verificationToken.identifier, verificationToken.token],
    }),
  })
);

// ============================================================
// Application tables
// ============================================================

export const courses = pgTable("course", {
  id: uuid("id").primaryKey().defaultRandom(),
  syllabusId: text("syllabus_id"),
  requirementType: text("requirement_type").$type<Requirement | null>(),
  name: text("name").notNull(),
  day: text("day").$type<DayOfWeek | null>(),
  periods: integer("periods").array(),
  category: text("category").$type<Category>().notNull(),
  grades: integer("grades").array(),
  className: text("class_name"),
  classroom: text("classroom"),
  credits: integer("credits").notNull(),
  instructors: text("instructors").array(),
  note: text("note"),
  features: text("features").$type<Feature | null>(),
  academicYear: integer("academic_year").notNull(),
  semester: text("semester").$type<Semester>().notNull(),
  department: text("department").notNull().default("情報学部"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
});

export const courseLegacyNames = pgTable(
  "course_legacy_name",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    legacyAcademicYear: integer("legacy_academic_year").notNull(),
    legacyName: text("legacy_name").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    uniqueCourseLegacyName: uniqueIndex(
      "course_legacy_name_course_legacy_year_name_unique"
    ).on(table.courseId, table.legacyAcademicYear, table.legacyName),
  })
);

export const userCourses = pgTable(
  "user_course",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  },
  (uc) => ({
    uniqueUserCourse: uniqueIndex("user_course_unique").on(
      uc.userId,
      uc.courseId
    ),
  })
);

export const userCoursePreferences = pgTable("user_course_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  studentEmail: text("student_email").notNull(),
  gradeMode: text("grade_mode").notNull().default("auto"),
  manualGrade: integer("manual_grade"),
  classMode: text("class_mode").notNull().default("auto"),
  manualClass: text("manual_class"),
  selectedCourse: text("selected_course"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
});

export const academicCalendarSessions = pgTable(
  "academic_calendar_session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    academicYear: integer("academic_year").notNull(),
    semester: text("semester").$type<Semester>().notNull(),
    actualDate: date("actual_date", { mode: "string" }).notNull(),
    actualDay: text("actual_day").$type<DayOfWeek>().notNull(),
    effectiveDay: text("effective_day").$type<DayOfWeek>().notNull(),
    lectureNumber: integer("lecture_number").notNull(),
    rawLabel: text("raw_label").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    uniqueAcademicCalendarSessionDate: uniqueIndex(
      "academic_calendar_session_academic_year_actual_date_unique"
    ).on(table.academicYear, table.actualDate),
  })
);

// ============================================================
// Inferred types
// ============================================================

export type Course = typeof courses.$inferSelect;
export type NewCourse = typeof courses.$inferInsert;
export type CourseLegacyName = typeof courseLegacyNames.$inferSelect;
export type NewCourseLegacyName = typeof courseLegacyNames.$inferInsert;
export type AcademicCalendarSession = typeof academicCalendarSessions.$inferSelect;
export type NewAcademicCalendarSession =
  typeof academicCalendarSessions.$inferInsert;
export type UserCourse = typeof userCourses.$inferSelect;
export type UserCoursePreferencesRecord = typeof userCoursePreferences.$inferSelect;
