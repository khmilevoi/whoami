import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/infrastructure/sqlite/db.js";
import { SqliteGameRepository } from "../../src/infrastructure/sqlite/game-repository.js";
import { GameEngine } from "../../src/domain/game-engine.js";

const canUseBetterSqlite = (): boolean => {
  try {
    const db = createDatabase(":memory:");
    db.close();
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return !message.includes("Could not locate the bindings file");
  }
};

const runIfSqliteReady = canUseBetterSqlite() ? it : it.skip;

describe("sqlite repository", () => {
  runIfSqliteReady("enforces single active game per chat", () => {
    const db = createDatabase(":memory:");
    const repo = new SqliteGameRepository(db);
    const engine = new GameEngine();
    const now = new Date().toISOString();

    const game1 = engine.createGame({
      gameId: "g1",
      chatId: "chat-1",
      now,
      creator: {
        id: "p1",
        telegramUserId: "1",
        displayName: "P1",
      },
    });

    repo.create(game1);

    const game2 = engine.createGame({
      gameId: "g2",
      chatId: "chat-1",
      now,
      creator: {
        id: "p2",
        telegramUserId: "2",
        displayName: "P2",
      },
    });

    expect(() => repo.create(game2)).toThrowError();
    db.close();
  });
});
