"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const game_engine_1 = require("../../src/domain/game-engine");
const engine = new game_engine_1.GameEngine();
(0, vitest_1.describe)("game engine", () => {
    (0, vitest_1.it)("rejects giveup outside IN_PROGRESS", () => {
        const game = engine.createGame({
            gameId: "g1",
            chatId: "c1",
            now: new Date().toISOString(),
            creator: {
                id: "p1",
                telegramUserId: "1",
                displayName: "P1",
            },
        });
        (0, vitest_1.expect)(() => engine.giveUp(game, {
            playerId: "p1",
            now: new Date().toISOString(),
            turnRecordId: "t1",
        })).toThrowError();
    });
});
