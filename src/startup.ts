import { TelegramCommandSync } from "./adapters/telegram/telegram-command-sync";
import { GameService } from "./application/game-service";
import { LoggerPort } from "./application/ports";

interface StartupDependencies {
  commandSync: TelegramCommandSync;
  gameService: GameService;
  logger: LoggerPort;
}

export const runStartupTasks = async ({ commandSync, gameService, logger }: StartupDependencies): Promise<void> => {
  try {
    await commandSync.syncPrivateCommands();
    await commandSync.syncGroupCommands();
    await commandSync.syncKnownChats();
  } catch (error) {
    logger.error("commands_sync_failed", {
      chatId: "startup",
      scope: "startup",
      reason: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    await gameService.recoverManualPairingPromptsOnStartup();
  } catch (error) {
    logger.error("manual_pairing_recovery_failed", {
      scope: "startup",
      reason: error instanceof Error ? error.message : String(error),
    });
  }
};
