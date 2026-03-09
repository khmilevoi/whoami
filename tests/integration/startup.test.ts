import { describe, expect, it, vi } from "vitest";
import { TelegramCommandSync } from "../../src/adapters/telegram/telegram-command-sync";
import { GameService } from "../../src/application/game-service";
import { LoggerPort } from "../../src/application/ports";
import { runStartupTasks } from "../../src/startup";

const createLogger = (): LoggerPort => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

describe("startup tasks", () => {
  it("runs command sync and manual pairing recovery", async () => {
    const commandSync = {
      syncPrivateCommands: vi.fn(async () => undefined),
      syncGroupCommands: vi.fn(async () => undefined),
      syncActiveChats: vi.fn(async () => undefined),
    } as unknown as TelegramCommandSync;

    const gameService = {
      recoverManualPairingPromptsOnStartup: vi.fn(async () => undefined),
    } as unknown as GameService;

    const logger = createLogger();

    await runStartupTasks({
      commandSync,
      gameService,
      logger,
    });

    expect(commandSync.syncPrivateCommands).toHaveBeenCalledTimes(1);
    expect(commandSync.syncGroupCommands).toHaveBeenCalledTimes(1);
    expect(commandSync.syncActiveChats).toHaveBeenCalledTimes(1);
    expect(gameService.recoverManualPairingPromptsOnStartup).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("still runs manual pairing recovery when command sync fails", async () => {
    const commandSync = {
      syncPrivateCommands: vi.fn(async () => {
        throw new Error("sync failed");
      }),
      syncGroupCommands: vi.fn(async () => undefined),
      syncActiveChats: vi.fn(async () => undefined),
    } as unknown as TelegramCommandSync;

    const gameService = {
      recoverManualPairingPromptsOnStartup: vi.fn(async () => undefined),
    } as unknown as GameService;

    const logger = createLogger();

    await runStartupTasks({
      commandSync,
      gameService,
      logger,
    });

    expect(gameService.recoverManualPairingPromptsOnStartup).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      "commands_sync_failed",
      expect.objectContaining({
        chatId: "startup",
        scope: "startup",
      }),
    );
  });
});

