import * as errore from "errore";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { DatabaseOpenError } from "../../domain/errors.js";
import { runMigrations } from "./migrations.js";

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

  const db = errore.try({
    try: () => new Database(filePath),
    catch: (error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("Could not locate the bindings file")) {
        return new DatabaseOpenError({
          filePath,
          cause: new Error(`${missingBindingHint}\n\n${message}`),
        });
      }

      return new DatabaseOpenError({ filePath, cause: error });
    },
  });

  if (db instanceof Error) {
    throw db;
  }

  runMigrations(db);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
};
