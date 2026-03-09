import Database from "better-sqlite3";
import { TransactionRunner } from "../../application/ports";

export class SqliteTransactionRunner implements TransactionRunner {
  constructor(private readonly db: Database.Database) {}

  runInTransaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
