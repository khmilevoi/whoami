import { describe, expect, it, vi } from "vitest";
import { TelegramCommandSync } from "../../../src/adapters/telegram/telegram-command-sync.js";
import { createBotCommands } from "../../../src/application/bot-commands.js";
import { ChatCommandResolver } from "../../../src/application/chat-command-resolver.js";
import { GameQueryService } from "../../../src/application/game-query-service.js";
import { LoggerPort } from "../../../src/application/ports.js";
import { TextService } from "../../../src/application/text-service.js";
import { GameState } from "../../../src/domain/types.js";

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

const createQueryServiceStub = (state: {
  game: GameState | null;
  knownChatIds?: string[];
  knownUserIdsByChatId?: Record<string, string[]>;
}) =>
  ({
    findActiveGameByChatId: (chatId: string) =>
      state.game && state.game.chatId === chatId ? state.game : null,
    listActiveChatIdsByTelegramUser: () => [],
    listActiveChatIds: () => [],
    listKnownChatIds: () => state.knownChatIds ?? [],
    listKnownTelegramUserIdsByChatId: (chatId: string) =>
      state.knownUserIdsByChatId?.[chatId] ?? [],
  }) as unknown as GameQueryService;

const texts = new TextService("ru");
const commands = createBotCommands(texts);

describe("telegram command sync", () => {
  it("syncs default group commands for all group chats", async () => {
    const api = {
      setMyCommands: vi.fn(async () => true),
      deleteMyCommands: vi.fn(async () => true),
    };

    const query = createQueryServiceStub({ game: null });

    const sync = new TelegramCommandSync(
      api,
      query,
      new ChatCommandResolver(texts),
      createLogger(),
      texts,
    );

    await sync.syncGroupCommands();

    expect(api.setMyCommands).toHaveBeenCalledTimes(1);
    expect(api.setMyCommands).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          command: commands.BOT_COMMANDS.START_GAME.command,
        }),
      ],
      {
        scope: {
          type: "all_group_chats",
        },
      },
    );
    expect(api.deleteMyCommands).not.toHaveBeenCalled();
  });

  it("does not call Telegram API when group command set did not change", async () => {
    const api = {
      setMyCommands: vi.fn(async () => true),
      deleteMyCommands: vi.fn(async () => true),
    };

    const query = createQueryServiceStub({ game: null });

    const sync = new TelegramCommandSync(
      api,
      query,
      new ChatCommandResolver(texts),
      createLogger(),
      texts,
    );

    await sync.syncGroupCommands();
    await sync.syncGroupCommands();

    expect(api.setMyCommands).toHaveBeenCalledTimes(1);
    expect(api.deleteMyCommands).not.toHaveBeenCalled();
  });

  it("applies group defaults in startup flow even when no active chats", async () => {
    const api = {
      setMyCommands: vi.fn(async () => true),
      deleteMyCommands: vi.fn(async () => true),
    };

    const query = createQueryServiceStub({ game: null });

    const sync = new TelegramCommandSync(
      api,
      query,
      new ChatCommandResolver(texts),
      createLogger(),
      texts,
    );

    await sync.syncPrivateCommands();
    await sync.syncGroupCommands();
    await sync.syncActiveChats();

    expect(api.setMyCommands).toHaveBeenCalledTimes(2);
    expect(api.setMyCommands).toHaveBeenNthCalledWith(
      1,
      [
        expect.objectContaining({
          command: commands.BOT_COMMANDS.START_PRIVATE.command,
        }),
      ],
      {
        scope: {
          type: "all_private_chats",
        },
      },
    );
    expect(api.setMyCommands).toHaveBeenNthCalledWith(
      2,
      [
        expect.objectContaining({
          command: commands.BOT_COMMANDS.START_GAME.command,
        }),
      ],
      {
        scope: {
          type: "all_group_chats",
        },
      },
    );
    expect(api.deleteMyCommands).not.toHaveBeenCalled();
  });

  it("syncKnownChats syncs every known chat", async () => {
    const api = {
      setMyCommands: vi.fn(async () => true),
      deleteMyCommands: vi.fn(async () => true),
    };

    const query = createQueryServiceStub({
      game: null,
      knownChatIds: ["-1001", "-1002"],
    });

    const sync = new TelegramCommandSync(
      api,
      query,
      new ChatCommandResolver(texts),
      createLogger(),
      texts,
    );

    await sync.syncKnownChats();

    expect(api.setMyCommands).toHaveBeenCalledTimes(2);
    expect(api.setMyCommands).toHaveBeenNthCalledWith(
      1,
      [expect.objectContaining({ command: "whoami_start" })],
      {
        scope: {
          type: "chat",
          chat_id: -1001,
        },
      },
    );
    expect(api.setMyCommands).toHaveBeenNthCalledWith(
      2,
      [expect.objectContaining({ command: "whoami_start" })],
      {
        scope: {
          type: "chat",
          chat_id: -1002,
        },
      },
    );
  });

  it("does not call Telegram API when command set did not change", async () => {
    const api = {
      setMyCommands: vi.fn(async () => true),
      deleteMyCommands: vi.fn(async () => true),
    };

    const state = {
      game: null as GameState | null,
    };

    const query = createQueryServiceStub(state);

    const sync = new TelegramCommandSync(
      api,
      query,
      new ChatCommandResolver(texts),
      createLogger(),
      texts,
    );

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

    const query = createQueryServiceStub(state);

    const sync = new TelegramCommandSync(
      api,
      query,
      new ChatCommandResolver(texts),
      createLogger(),
      texts,
    );

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
      knownUserIdsByChatId: {
        "-1001": ["101", "202"],
      },
    };

    const query = createQueryServiceStub(state);

    const sync = new TelegramCommandSync(
      api,
      query,
      new ChatCommandResolver(texts),
      createLogger(),
      texts,
    );

    await sync.syncChat("-1001");
    state.game = null;
    await sync.syncChat("-1001");

    const lastSetCall = api.setMyCommands.mock.calls.at(-1) as unknown;
    const [lastCommands, lastScope] = lastSetCall as [unknown, unknown];
    expect(lastCommands).toEqual([
      expect.objectContaining({ command: "whoami_start" }),
    ]);
    expect(lastScope).toEqual({
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

  it("force-cleans chat_member scopes for known users after restart", async () => {
    const api = {
      setMyCommands: vi.fn(async () => true),
      deleteMyCommands: vi.fn(async () => true),
    };

    const query = createQueryServiceStub({
      game: null,
      knownUserIdsByChatId: {
        "-1001": ["101"],
      },
    });

    const sync = new TelegramCommandSync(
      api,
      query,
      new ChatCommandResolver(texts),
      createLogger(),
      texts,
    );

    await sync.syncChat("-1001");

    expect(api.setMyCommands).toHaveBeenCalledWith(
      [expect.objectContaining({ command: "whoami_start" })],
      {
        scope: {
          type: "chat",
          chat_id: -1001,
        },
      },
    );

    expect(api.deleteMyCommands).toHaveBeenCalledWith({
      scope: {
        type: "chat_member",
        chat_id: -1001,
        user_id: 101,
      },
    });
  });
});

