import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import { neon } from "@neondatabase/serverless";

type JournalEntry = {
  when: number;
  tag: string;
};

type JournalFile = {
  entries: JournalEntry[];
};

type MigrationRow = {
  created_at: number | string;
};

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  const sql = neon(process.env.DATABASE_URL);
  const journal = JSON.parse(
    fs.readFileSync("drizzle/meta/_journal.json", "utf8")
  ) as JournalFile;

  await sql.query('CREATE SCHEMA IF NOT EXISTS "drizzle"');
  await sql.query(`
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);

  const appliedRows = (await sql.query(
    'SELECT created_at FROM "drizzle"."__drizzle_migrations" ORDER BY created_at'
  )) as MigrationRow[];
  const appliedSet = new Set(
    appliedRows.map((row) => Number(row.created_at))
  );

  for (const entry of journal.entries) {
    if (appliedSet.has(entry.when)) {
      continue;
    }

    const migrationSql = fs.readFileSync(`drizzle/${entry.tag}.sql`, "utf8");
    const hash = crypto.createHash("sha256").update(migrationSql).digest("hex");

    const statements = migrationSql
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await sql.query(statement);
    }

    await sql.query(
      `INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ($1, $2)`,
      [hash, entry.when]
    );

    console.log(`applied ${entry.tag}`);
  }

  console.log("migration-sync-complete");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});