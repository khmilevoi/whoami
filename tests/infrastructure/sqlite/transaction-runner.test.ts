import { describe, expect, it, vi } from "vitest";
import { GameNotFoundError } from "../../../src/domain/errors";
import { SqliteTransactionRunner } from "../../../src/infrastructure/sqlite/transaction-runner";

describe("sqlite transaction runner", () => {
  it("commits when work succeeds", () => {
    const db = {
      exec: vi.fn(),
    };
    const runner = new SqliteTransactionRunner(db as never);

    const result = runner.runInTransaction(() => "ok");

    expect(result).toBe("ok");
    expect(db.exec).toHaveBeenNthCalledWith(1, "BEGIN IMMEDIATE");
    expect(db.exec).toHaveBeenNthCalledWith(2, "COMMIT");
  });

  it("rolls back when work returns an expected error", () => {
    const db = {
      exec: vi.fn(),
    };
    const runner = new SqliteTransactionRunner(db as never);
    const expectedError = new GameNotFoundError();

    const result = runner.runInTransaction(() => expectedError);

    expect(result).toBe(expectedError);
    expect(db.exec).toHaveBeenNthCalledWith(1, "BEGIN IMMEDIATE");
    expect(db.exec).toHaveBeenNthCalledWith(2, "ROLLBACK");
  });

  it("rolls back and rethrows when work throws unexpectedly", () => {
    const db = {
      exec: vi.fn(),
    };
    const runner = new SqliteTransactionRunner(db as never);
    const unexpectedError = new Error("boom");

    expect(() => {
      runner.runInTransaction(() => {
        throw unexpectedError;
      });
    }).toThrow(unexpectedError);

    expect(db.exec).toHaveBeenNthCalledWith(1, "BEGIN IMMEDIATE");
    expect(db.exec).toHaveBeenNthCalledWith(2, "ROLLBACK");
  });
});
