import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { runMigrations } from "./migrations";

const missingBindingHint = [
  "better-sqlite3 native bindings are missing.",
  "Run:",
  "  pnpm approve-builds",
  "  pnpm rebuild better-sqlite3",
].join("\n");

export const createDatabase = (filePath: string): Database.Database => {
  if (filePath !== ":memory:") {
    mkdirSync(dirname(filePath), { recursive: true });
  }

  let db: Database.Database;
  try {
    db = new Database(filePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Could not locate the bindings file")) {
      throw new Error(`${missingBindingHint}\n\n${message}`);
    }
    throw error;
  }

  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  runMigrations(db);
  return db;
};
