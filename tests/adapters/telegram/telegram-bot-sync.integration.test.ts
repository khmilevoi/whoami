import { Bot } from "grammy";
import { describe, expect, it, vi } from "vitest";
import { registerTelegramHandlers } from "../../../src/adapters/telegram/telegram-bot";
import { TelegramCommandSync } from "../../../src/adapters/telegram/telegram-command-sync";
import { GameService } from "../../../src/application/game-service";
import { LoggerPort } from "../../../src/application/ports";

const createGameServiceStub = (): GameService =>
  ({
    handlePrivateStart: vi.fn(async () => undefined),
    startGame: vi.fn(async () => undefined),
    joinGame: vi.fn(async () => undefined),
    beginConfiguration: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
    giveUp: vi.fn(async () => undefined),
    askOffline: vi.fn(async () => undefined),
    handlePrivateText: vi.fn(async () => undefined),
    handleGroupText: vi.fn(async () => undefined),
    applyConfigStep: vi.fn(async () => undefined),
    applyManualPair: vi.fn(async () => undefined),
    handleWordCallback: vi.fn(async () => undefined),
    handleVote: vi.fn(async () => undefined),
  } as unknown as GameService);

const createLogger = (): LoggerPort => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

describe("telegram bot command sync integration", () => {
  it("syncs union of before/after chat ids for private update", async () => {
    const bot = new Bot("123456:TEST_TOKEN");
    const gameService = createGameServiceStub();
    const logger = createLogger();

    const listActiveChatIdsByTelegramUser = vi
      .fn()
      .mockReturnValueOnce(["-1001"])
      .mockReturnValueOnce(["-1001", "-1002"]);

    const syncChat = vi.fn(async () => undefined);

    const commandSync = {
      listActiveChatIdsByTelegramUser,
      syncChat,
    } as unknown as TelegramCommandSync;

    registerTelegramHandlers(bot, gameService, logger, commandSync);

    await bot.handleUpdate({
      update_id: 1,
      message: {
        message_id: 1,
        date: 1,
        text: "слово",
        from: {
          id: 101,
          is_bot: false,
          first_name: "User",
        },
        chat: {
          id: 101,
          type: "private",
          first_name: "User",
        },
      },
    } as never);

    expect(gameService.handlePrivateText).toHaveBeenCalledWith("101", "слово");
    expect(syncChat).toHaveBeenCalledTimes(2);
    expect(syncChat).toHaveBeenNthCalledWith(1, "-1001");
    expect(syncChat).toHaveBeenNthCalledWith(2, "-1002");
  });
});
