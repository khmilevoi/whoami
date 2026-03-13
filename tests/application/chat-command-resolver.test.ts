import { describe, expect, it } from "vitest";
import { ChatCommandResolver } from "../../src/application/chat-command-resolver.js";
import { GameStatusSnapshot } from "../../src/application/game-status-service.js";
import { TextService } from "../../src/application/text-service.js";
import { GameStage } from "../../src/domain/types.js";

const resolver = new ChatCommandResolver(new TextService("ru"));

const createSnapshot = (stage: GameStage): GameStatusSnapshot => ({
  gameId: "g1",
  chatId: "-1001",
  stage,
  mode: "NORMAL",
  playMode: "ONLINE",
  updatedAt: "2026-01-01T00:00:00.000Z",
  creatorPlayerId: "p1",
  creatorTelegramUserId: "101",
  playerCount: 2,
  playerIds: ["p1", "p2"],
  playerTelegramUserIds: ["101", "202"],
  readyCount: 0,
  manualPairingPending: false,
  hasPendingVote: false,
  isFinished: stage === "FINISHED",
  isCanceled: stage === "CANCELED",
  hasActiveGame: stage !== "FINISHED" && stage !== "CANCELED",
});

describe("chat command resolver", () => {
  it("returns start command when no active game", () => {
    const resolution = resolver.resolve(null);

    expect(resolution.chatCommands.map((command) => command.command)).toEqual([
      "whoami_start",
    ]);
    expect(resolution.memberOverrides).toEqual([]);
  });

  it("returns creator cancel only during lobby", () => {
    const resolution = resolver.resolve(createSnapshot("LOBBY_OPEN"));

    expect(resolution.chatCommands).toEqual([]);
    expect(resolution.memberOverrides).toEqual([
      {
        telegramUserId: "101",
        commands: [expect.objectContaining({ command: "whoami_cancel" })],
      },
    ]);
  });

  it("returns creator cancel only for pre-game locked stages", () => {
    const stages: GameStage[] = [
      "LOBBY_CLOSED",
      "CONFIGURING",
      "PREPARE_WORDS",
      "READY_WAIT",
    ];

    for (const stage of stages) {
      const resolution = resolver.resolve(createSnapshot(stage));
      expect(resolution.chatCommands).toEqual([]);
      expect(resolution.memberOverrides).toEqual([
        {
          telegramUserId: "101",
          commands: [expect.objectContaining({ command: "whoami_cancel" })],
        },
      ]);
    }
  });

  it("returns only giveup during in-progress", () => {
    const resolution = resolver.resolve(createSnapshot("IN_PROGRESS"));

    expect(resolution.chatCommands.map((command) => command.command)).toEqual([
      "giveup",
    ]);
    expect(resolution.memberOverrides).toEqual([]);
  });

  it("returns start command for finished and canceled games", () => {
    const finished = resolver.resolve(createSnapshot("FINISHED"));
    const canceled = resolver.resolve(createSnapshot("CANCELED"));

    expect(finished.chatCommands.map((command) => command.command)).toEqual([
      "whoami_start",
    ]);
    expect(canceled.chatCommands.map((command) => command.command)).toEqual([
      "whoami_start",
    ]);
  });
});
