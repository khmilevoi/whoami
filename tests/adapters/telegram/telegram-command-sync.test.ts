import { describe, expect, it, vi } from "vitest";
import { ChatCommandResolver } from "../../../src/application/chat-command-resolver";
import { GameQueryService } from "../../../src/application/game-query-service";
import { LoggerPort } from "../../../src/application/ports";
import { GameState } from "../../../src/domain/types";
import { TelegramCommandSync } from "../../../src/adapters/telegram/telegram-command-sync";

const createOfflineInProgressGame = (turnCursor: number): GameState => ({
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
    turnCursor,
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

const createLogger = (): LoggerPort => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

describe("telegram command sync", () => {
  it("does not call Telegram API when command set did not change", async () => {
    const api = {
      setMyCommands: vi.fn(async () => true),
      deleteMyCommands: vi.fn(async () => true),
    };

    const state = {
      game: null as GameState | null,
    };

    const query = {
      findActiveGameByChatId: () => state.game,
      listActiveChatIdsByTelegramUser: () => [],
      listActiveChatIds: () => [],
    } as unknown as GameQueryService;

    const sync = new TelegramCommandSync(api, query, new ChatCommandResolver(), createLogger());

    await sync.syncChat("-1001");
    await sync.syncChat("-1001");

    expect(api.setMyCommands).toHaveBeenCalledTimes(1);
    expect(api.deleteMyCommands).not.toHaveBeenCalled();
  });

  it("removes stale chat_member scope when offline asker changes", async () => {
    const api = {
      setMyCommands: vi.fn(async () => true),
      deleteMyCommands: vi.fn(async () => true),
    };

    const state = {
      game: createOfflineInProgressGame(0),
    };

    const query = {
      findActiveGameByChatId: () => state.game,
      listActiveChatIdsByTelegramUser: () => [],
      listActiveChatIds: () => [],
    } as unknown as GameQueryService;

    const sync = new TelegramCommandSync(api, query, new ChatCommandResolver(), createLogger());

    await sync.syncChat("-1001");
    state.game = createOfflineInProgressGame(1);
    await sync.syncChat("-1001");

    expect(api.setMyCommands).toHaveBeenCalledTimes(3);
    expect(api.deleteMyCommands).toHaveBeenCalledTimes(1);
    expect(api.deleteMyCommands).toHaveBeenCalledWith({
      scope: {
        type: "chat_member",
        chat_id: -1001,
        user_id: 101,
      },
    });
  });

  it("falls back to /whoami_start and clears member overrides when active game is gone", async () => {
    const api = {
      setMyCommands: vi.fn(async () => true),
      deleteMyCommands: vi.fn(async () => true),
    };

    const state = {
      game: createOfflineInProgressGame(0) as GameState | null,
    };

    const query = {
      findActiveGameByChatId: () => state.game,
      listActiveChatIdsByTelegramUser: () => [],
      listActiveChatIds: () => [],
    } as unknown as GameQueryService;

    const sync = new TelegramCommandSync(api, query, new ChatCommandResolver(), createLogger());

    await sync.syncChat("-1001");
    state.game = null;
    await sync.syncChat("-1001");

    const lastSetCall = api.setMyCommands.mock.calls[api.setMyCommands.mock.calls.length - 1];
    expect(lastSetCall[0]).toEqual([
      expect.objectContaining({ command: "whoami_start" }),
    ]);
    expect(lastSetCall[1]).toEqual({
      scope: {
        type: "chat",
        chat_id: -1001,
      },
    });

    expect(api.deleteMyCommands).toHaveBeenCalledWith({
      scope: {
        type: "chat_member",
        chat_id: -1001,
        user_id: 101,
      },
    });
  });
});
