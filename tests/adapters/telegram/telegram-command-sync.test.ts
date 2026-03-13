import { describe, expect, it, vi } from "vitest";
import { TelegramCommandSync } from "../../../src/adapters/telegram/telegram-command-sync.js";
import { createBotCommands } from "../../../src/application/bot-commands.js";
import { InMemoryGameStatusService } from "../../../src/application/game-status-service.js";
import { ChatCommandResolver } from "../../../src/application/chat-command-resolver.js";
import { LoggerPort } from "../../../src/application/ports.js";
import { TextService } from "../../../src/application/text-service.js";
import { GameState } from "../../../src/domain/types.js";
import { FakeGameRepository } from "../../mocks/fake-game-repository.js";

const createInProgressGame = (): GameState => ({
  id: "g1",
  chatId: "-1001",
  creatorPlayerId: "p1",
  creatorTelegramUserId: "101",
  stage: "IN_PROGRESS",
  config: {
    mode: "NORMAL",
    playMode: "OFFLINE",
    pairingMode: "RANDOM",
  },
  players: [
    {
      id: "p1",
      telegramUserId: "101",
      displayName: "P1",
      stage: "JOINED",
      dmOpened: true,
      joinedAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "p2",
      telegramUserId: "202",
      displayName: "P2",
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
  ui: {
    privatePanels: {},
  },
});

const createLogger = (): LoggerPort => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

const createSyncHarness = (game: GameState | null) => {
  const api = {
    setMyCommands: vi.fn(async () => true),
    deleteMyCommands: vi.fn(async () => true),
  };
  const repository = new FakeGameRepository();
  const logger = createLogger();
  const statusService = new InMemoryGameStatusService(repository, logger);
  if (game) {
    repository.create(game);
    statusService.publish(game);
  }

  const sync = new TelegramCommandSync(
    api,
    repository,
    statusService,
    new ChatCommandResolver(texts),
    logger,
    texts,
  );

  return { api, repository, statusService, sync, logger };
};

const texts = new TextService("ru");
const commands = createBotCommands(texts);

describe("telegram command sync", () => {
  it("syncs default group commands for all group chats", async () => {
    const { api, sync } = createSyncHarness(null);

    await sync.syncGroupCommands();

    expect(api.setMyCommands).toHaveBeenCalledWith(
      [expect.objectContaining({ command: commands.BOT_COMMANDS.START_GAME.command })],
      { scope: { type: "all_group_chats" } },
    );
  });

  it("syncs private commands", async () => {
    const { api, sync } = createSyncHarness(null);

    await sync.syncPrivateCommands();

    expect(api.setMyCommands).toHaveBeenCalledWith(
      [expect.objectContaining({ command: commands.BOT_COMMANDS.START_PRIVATE.command })],
      { scope: { type: "all_private_chats" } },
    );
  });

  it("keeps only creator cancel override during lobby", async () => {
    const lobbyGame = { ...createInProgressGame(), stage: "LOBBY_OPEN" as const };
    const { api, sync } = createSyncHarness(lobbyGame);

    await sync.syncChat("-1001");

    expect(api.deleteMyCommands).not.toHaveBeenCalled();
    expect(api.setMyCommands).toHaveBeenCalledTimes(1);
    expect(api.setMyCommands).toHaveBeenCalledWith(
      [expect.objectContaining({ command: "whoami_cancel" })],
      {
        scope: {
          type: "chat_member",
          chat_id: -1001,
          user_id: 101,
        },
      },
    );
  });

  it("syncs only giveup during in-progress", async () => {
    const { api, sync } = createSyncHarness(createInProgressGame());

    await sync.syncChat("-1001");

    expect(api.setMyCommands).toHaveBeenCalledWith(
      [expect.objectContaining({ command: "giveup" })],
      {
        scope: {
          type: "chat",
          chat_id: -1001,
        },
      },
    );
  });
});
