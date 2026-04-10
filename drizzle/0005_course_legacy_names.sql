CREATE TABLE "course_legacy_name" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"legacy_academic_year" integer NOT NULL,
	"legacy_name" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "course_legacy_name" ADD CONSTRAINT "course_legacy_name_course_id_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "course_legacy_name_course_legacy_year_name_unique" ON "course_legacy_name" USING btree ("course_id","legacy_academic_year","legacy_name");
--> statement-breakpoint
INSERT INTO "course_legacy_name" ("course_id", "legacy_academic_year", "legacy_name")
SELECT "id", 2023, '基礎ゼミ1'
FROM "course"
WHERE "academic_year" = 2026 AND btrim("name") = '近大ゼミ'
ON CONFLICT ("course_id", "legacy_academic_year", "legacy_name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "course_legacy_name" ("course_id", "legacy_academic_year", "legacy_name")
SELECT "id", 2023, '基礎ゼミ2'
FROM "course"
WHERE "academic_year" = 2026 AND btrim("name") = '情報学入門ゼミナール'
ON CONFLICT ("course_id", "legacy_academic_year", "legacy_name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "course_legacy_name" ("course_id", "legacy_academic_year", "legacy_name")
SELECT "id", 2025, '機械学習概論'
FROM "course"
WHERE "academic_year" = 2026 AND btrim("name") = 'AIリテラシー'
ON CONFLICT ("course_id", "legacy_academic_year", "legacy_name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "course_legacy_name" ("course_id", "legacy_academic_year", "legacy_name")
SELECT "id", 2025, '実践機械学習'
FROM "course"
WHERE "academic_year" = 2026 AND btrim("name") = 'データエンジニアリング'
ON CONFLICT ("course_id", "legacy_academic_year", "legacy_name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "course_legacy_name" ("course_id", "legacy_academic_year", "legacy_name")
SELECT "id", 2025, 'データベース論'
FROM "course"
WHERE "academic_year" = 2026 AND btrim("name") = 'データベースシステム'
ON CONFLICT ("course_id", "legacy_academic_year", "legacy_name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "course_legacy_name" ("course_id", "legacy_academic_year", "legacy_name")
SELECT "id", 2025, 'オブジェクト指向プログラミング'
FROM "course"
WHERE "academic_year" = 2026 AND btrim("name") = 'オブジェクト指向プログラミング１'
ON CONFLICT ("course_id", "legacy_academic_year", "legacy_name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "course_legacy_name" ("course_id", "legacy_academic_year", "legacy_name")
SELECT "id", 2025, '情報処理実習１'
FROM "course"
WHERE "academic_year" = 2026 AND btrim("name") = 'アプリケーション開発実習１'
ON CONFLICT ("course_id", "legacy_academic_year", "legacy_name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "course_legacy_name" ("course_id", "legacy_academic_year", "legacy_name")
SELECT "id", 2025, '情報処理実習２'
FROM "course"
WHERE "academic_year" = 2026 AND btrim("name") = 'AIプログラミング'
ON CONFLICT ("course_id", "legacy_academic_year", "legacy_name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "course_legacy_name" ("course_id", "legacy_academic_year", "legacy_name")
SELECT "id", 2025, '英語総合１'
FROM "course"
WHERE "academic_year" = 2026 AND btrim("name") = '総合英語１'
ON CONFLICT ("course_id", "legacy_academic_year", "legacy_name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "course_legacy_name" ("course_id", "legacy_academic_year", "legacy_name")
SELECT "id", 2025, '英語総合2'
FROM "course"
WHERE "academic_year" = 2026 AND btrim("name") = '総合英語2'
ON CONFLICT ("course_id", "legacy_academic_year", "legacy_name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "course_legacy_name" ("course_id", "legacy_academic_year", "legacy_name")
SELECT "id", 2025, 'アカデミックイングリッシュ１'
FROM "course"
WHERE "academic_year" = 2026 AND btrim("name") = '技術英語１'
ON CONFLICT ("course_id", "legacy_academic_year", "legacy_name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "course_legacy_name" ("course_id", "legacy_academic_year", "legacy_name")
SELECT "id", 2025, 'アカデミックイングリッシュ2'
FROM "course"
WHERE "academic_year" = 2026 AND btrim("name") = '技術英語2'
ON CONFLICT ("course_id", "legacy_academic_year", "legacy_name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "course_legacy_name" ("course_id", "legacy_academic_year", "legacy_name")
SELECT "id", 2025, 'オーラルイングリッシュ3'
FROM "course"
WHERE "academic_year" = 2026 AND btrim("name") = 'オーラルスキル１'
ON CONFLICT ("course_id", "legacy_academic_year", "legacy_name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "course_legacy_name" ("course_id", "legacy_academic_year", "legacy_name")
SELECT "id", 2025, 'オーラルイングリッシュ4'
FROM "course"
WHERE "academic_year" = 2026 AND btrim("name") = 'オーラルスキル2'
ON CONFLICT ("course_id", "legacy_academic_year", "legacy_name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "course_legacy_name" ("course_id", "legacy_academic_year", "legacy_name")
SELECT "id", 2025, 'ライティング１'
FROM "course"
WHERE "academic_year" = 2026 AND btrim("name") = 'アカデミック英語１'
ON CONFLICT ("course_id", "legacy_academic_year", "legacy_name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "course_legacy_name" ("course_id", "legacy_academic_year", "legacy_name")
SELECT "id", 2025, 'ライティング2'
FROM "course"
WHERE "academic_year" = 2026 AND btrim("name") = 'アカデミック英語2'
ON CONFLICT ("course_id", "legacy_academic_year", "legacy_name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "course_legacy_name" ("course_id", "legacy_academic_year", "legacy_name")
SELECT "id", 2025, 'IT英語１'
FROM "course"
WHERE "academic_year" = 2026 AND btrim("name") = '海外技術英語研修１'
ON CONFLICT ("course_id", "legacy_academic_year", "legacy_name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "course_legacy_name" ("course_id", "legacy_academic_year", "legacy_name")
SELECT "id", 2025, 'IT英語2'
FROM "course"
WHERE "academic_year" = 2026 AND btrim("name") = '海外技術英語研修2'
ON CONFLICT ("course_id", "legacy_academic_year", "legacy_name") DO NOTHING;