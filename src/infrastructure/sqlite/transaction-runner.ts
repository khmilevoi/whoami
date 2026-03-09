import Database from "better-sqlite3";
import { TransactionRunner } from "../../application/ports";

export class SqliteTransactionRunner implements TransactionRunner {
  constructor(private readonly db: Database.Database) {}

  runInTransaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      if (result instanceof Error) {
        this.db.exec("ROLLBACK");
        return result;
      }

      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
