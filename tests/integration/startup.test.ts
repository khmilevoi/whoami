import { describe, expect, it, vi } from "vitest";
import { CommandSyncError } from "../../src/domain/errors.js";
import { TelegramCommandSync } from "../../src/adapters/telegram/telegram-command-sync.js";
import { GameService } from "../../src/application/game-service.js";
import { GameStatusService, GameStatusSubscriber } from "../../src/application/game-status-service.js";
import { LoggerPort } from "../../src/application/ports.js";
import { runStartupTasks } from "../../src/startup.js";

const createLogger = (): LoggerPort => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

const createStatusServiceStub = () => ({
  publish: vi.fn(),
  clear: vi.fn(),
  getByChatId: vi.fn(() => null),
  getByGameId: vi.fn(() => null),
  listActiveChatIdsByTelegramUser: vi.fn(() => []),
  findConfiguringGameByCreator: vi.fn(() => null),
  subscribe: vi.fn(() => () => undefined),
  rebuildFromRepository: vi.fn(() => undefined),
}) as unknown as GameStatusService;

const createSubscriberStub = () => ({
  onGameStatusChanged: vi.fn(() => undefined),
}) as unknown as GameStatusSubscriber;

describe("startup tasks", () => {
  it("runs command sync, status rebuild and manual pairing recovery", async () => {
    const commandSync = {
      syncPrivateCommands: vi.fn(async () => undefined),
      syncGroupCommands: vi.fn(async () => undefined),
      syncKnownChats: vi.fn(async () => undefined),
    } as unknown as TelegramCommandSync;

    const gameService = {
      recoverManualPairingPromptsOnStartup: vi.fn(async () => undefined),
    } as unknown as GameService;

    const statusService = createStatusServiceStub();
    const pregameUiSubscriber = createSubscriberStub();
    const gameFlowSubscriber = createSubscriberStub();
    const logger = createLogger();

    await runStartupTasks({
      commandSync,
      gameService,
      statusService,
      pregameUiSubscriber,
      gameFlowSubscriber,
      logger,
    });

    expect(statusService.subscribe).toHaveBeenCalledTimes(3);
    expect(statusService.rebuildFromRepository).toHaveBeenCalledTimes(1);
    expect(commandSync.syncPrivateCommands).toHaveBeenCalledTimes(1);
    expect(commandSync.syncGroupCommands).toHaveBeenCalledTimes(1);
    expect(commandSync.syncKnownChats).toHaveBeenCalledTimes(1);
    expect(
      gameService.recoverManualPairingPromptsOnStartup,
    ).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("still runs manual pairing recovery when command sync returns an expected error", async () => {
    const commandSync = {
      syncPrivateCommands: vi.fn(
        async () => new CommandSyncError({ scope: "all_private_chats" }),
      ),
      syncGroupCommands: vi.fn(async () => undefined),
      syncKnownChats: vi.fn(async () => undefined),
    } as unknown as TelegramCommandSync;

    const gameService = {
      recoverManualPairingPromptsOnStartup: vi.fn(async () => undefined),
    } as unknown as GameService;

    const statusService = createStatusServiceStub();
    const pregameUiSubscriber = createSubscriberStub();
    const gameFlowSubscriber = createSubscriberStub();
    const logger = createLogger();

    await runStartupTasks({
      commandSync,
      gameService,
      statusService,
      pregameUiSubscriber,
      gameFlowSubscriber,
      logger,
    });

    expect(
      gameService.recoverManualPairingPromptsOnStartup,
    ).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      "commands_sync_failed",
      expect.objectContaining({
        chatId: "startup",
        scope: "all_private_chats",
      }),
    );
  });

  it("still runs manual pairing recovery when startup task throws unexpectedly", async () => {
    const commandSync = {
      syncPrivateCommands: vi.fn(async () => {
        throw new Error("sync failed");
      }),
      syncGroupCommands: vi.fn(async () => undefined),
      syncKnownChats: vi.fn(async () => undefined),
    } as unknown as TelegramCommandSync;

    const gameService = {
      recoverManualPairingPromptsOnStartup: vi.fn(async () => undefined),
    } as unknown as GameService;

    const statusService = createStatusServiceStub();
    const pregameUiSubscriber = createSubscriberStub();
    const gameFlowSubscriber = createSubscriberStub();
    const logger = createLogger();

    await runStartupTasks({
      commandSync,
      gameService,
      statusService,
      pregameUiSubscriber,
      gameFlowSubscriber,
      logger,
    });

    expect(
      gameService.recoverManualPairingPromptsOnStartup,
    ).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      "startup_task_failed",
      expect.objectContaining({
        task: "syncPrivateCommands",
      }),
    );
  });
});
