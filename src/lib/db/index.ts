import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

function createDb() {
	const databaseUrl = process.env.DATABASE_URL;

	if (!databaseUrl) {
		throw new Error(
			"No database connection string was provided. Set DATABASE_URL before executing database queries."
		);
	}

	const sql = neon(databaseUrl);
	return drizzle({ client: sql, schema });
}

type Database = ReturnType<typeof createDb>;

let database: Database | undefined;

export function getDb(): Database {
	if (!database) {
		database = createDb();
	}

	return database;
}

export const db: Database = new Proxy({} as Database, {
	get(_target, property) {
		const currentDb = getDb();
		const value = Reflect.get(currentDb, property, currentDb);

		return typeof value === "function" ? value.bind(currentDb) : value;
	},
});
