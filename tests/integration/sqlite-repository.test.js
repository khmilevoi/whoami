"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const db_1 = require("../../src/infrastructure/sqlite/db");
const game_repository_1 = require("../../src/infrastructure/sqlite/game-repository");
const game_engine_1 = require("../../src/domain/game-engine");
(0, vitest_1.describe)("sqlite repository", () => {
  (0, vitest_1.it)("enforces single active game per chat", () => {
    const db = (0, db_1.createDatabase)(":memory:");
    const repo = new game_repository_1.SqliteGameRepository(db);
    const engine = new game_engine_1.GameEngine();
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
    (0, vitest_1.expect)(() => repo.create(game2)).toThrowError();
  });
});
