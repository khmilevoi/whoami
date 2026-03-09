import { describe, expect, it } from "vitest";
import { ChatCommandResolver } from "../../src/application/chat-command-resolver";
import { TextService } from "../../src/application/text-service";
import { GameState, GameStage } from "../../src/domain/types";

const resolver = new ChatCommandResolver(new TextService("ru"));

const createGame = (stage: GameStage): GameState => ({
  id: "g1",
  chatId: "-1001",
  creatorPlayerId: "p1",
  creatorTelegramUserId: "101",
  stage,
  config: {
    mode: "NORMAL",
    playMode: "ONLINE",
    pairingMode: "RANDOM",
  },
  players: [
    {
      id: "p1",
      telegramUserId: "101",
      displayName: "Creator",
      stage: "JOINED",
      dmOpened: true,
      joinedAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "p2",
      telegramUserId: "202",
      displayName: "Player",
      stage: "JOINED",
      dmOpened: true,
      joinedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  pairings: {},
  words: {},
  preparation: {
    manualPairingQueue: [],
    manualPairingCursor: 0,
  },
  inProgress: {
    round: 1,
    turnOrder: ["p1", "p2"],
    turnCursor: 0,
    targetCursor: 0,
  },
  progress: {
    p1: {
      playerId: "p1",
      questionsAsked: 0,
      roundsUsed: 0,
      reverseGiveUpsByTarget: [],
    },
    p2: {
      playerId: "p2",
      questionsAsked: 0,
      roundsUsed: 0,
      reverseGiveUpsByTarget: [],
    },
  },
  turns: [],
  voteHistory: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("chat command resolver", () => {
  it("returns start command when no active game", () => {
    const resolution = resolver.resolve(null);

    expect(resolution.chatCommands.map((command) => command.command)).toEqual(["whoami_start"]);
    expect(resolution.memberOverrides).toEqual([]);
  });

  it("returns lobby commands for creator and players", () => {
    const resolution = resolver.resolve(createGame("LOBBY_OPEN"));

    expect(resolution.chatCommands.map((command) => command.command)).toEqual(["join"]);
    expect(resolution.memberOverrides).toEqual([
      {
        telegramUserId: "101",
        commands: expect.arrayContaining([
          expect.objectContaining({ command: "whoami_config" }),
          expect.objectContaining({ command: "whoami_cancel" }),
        ]),
      },
    ]);
  });

  it("returns creator cancel only for pre-game locked stages", () => {
    const stages: GameStage[] = ["LOBBY_CLOSED", "CONFIGURING", "PREPARE_WORDS", "READY_WAIT"];

    for (const stage of stages) {
      const resolution = resolver.resolve(createGame(stage));
      expect(resolution.chatCommands).toEqual([]);
      expect(resolution.memberOverrides).toEqual([
        {
          telegramUserId: "101",
          commands: [expect.objectContaining({ command: "whoami_cancel" })],
        },
      ]);
    }
  });

  it("returns online in-progress commands", () => {
    const game = createGame("IN_PROGRESS");
    game.config = {
      mode: "NORMAL",
      playMode: "ONLINE",
      pairingMode: "RANDOM",
    };

    const resolution = resolver.resolve(game);

    expect(resolution.chatCommands.map((command) => command.command)).toEqual(["giveup"]);
    expect(resolution.memberOverrides).toEqual([]);
  });

  it("returns /ask only for current offline asker", () => {
    const game = createGame("IN_PROGRESS");
    game.config = {
      mode: "NORMAL",
      playMode: "OFFLINE",
      pairingMode: "RANDOM",
    };
    game.inProgress.turnOrder = ["p1", "p2"];
    game.inProgress.turnCursor = 1;

    const resolution = resolver.resolve(game);

    expect(resolution.chatCommands.map((command) => command.command)).toEqual(["giveup"]);
    expect(resolution.memberOverrides).toEqual([
      {
        telegramUserId: "202",
        commands: expect.arrayContaining([
          expect.objectContaining({ command: "giveup" }),
          expect.objectContaining({ command: "ask" }),
        ]),
      },
    ]);
  });

  it("returns start command for finished and canceled games", () => {
    const finished = resolver.resolve(createGame("FINISHED"));
    const canceled = resolver.resolve(createGame("CANCELED"));

    expect(finished.chatCommands.map((command) => command.command)).toEqual(["whoami_start"]);
    expect(canceled.chatCommands.map((command) => command.command)).toEqual(["whoami_start"]);
  });
});
