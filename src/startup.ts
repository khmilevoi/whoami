import * as errore from "errore";
import * as appErrors from "./domain/errors.js";
import { TelegramCommandSync } from "./adapters/telegram/telegram-command-sync.js";
import { GameService } from "./application/game-service.js";
import {
  GameStatusService,
  GameStatusSubscriber,
} from "./application/game-status-service.js";
import type { RecoveryStartupError } from "./application/errors.js";
import { LoggerPort } from "./application/ports.js";

interface StartupDependencies {
  commandSync: TelegramCommandSync;
  gameService: GameService;
  statusService: GameStatusService;
  pregameUiSubscriber: GameStatusSubscriber;
  gameFlowSubscriber: GameStatusSubscriber;
  logger: LoggerPort;
}

const logStartupError = (
  logger: LoggerPort,
  error: appErrors.StartupAppError,
): void => {
  errore.matchError(error, {
    CommandSyncError: (typedError) => {
      logger.error("commands_sync_failed", {
        chatId: "startup",
        scope: typedError.scope,
        reason: typedError.message,
      });
    },
    StartupTaskError: (typedError) => {
      logger.error("startup_task_failed", {
        task: typedError.task,
        reason: typedError.message,
      });
    },
    Error: (unexpected) => {
      logger.error("startup_task_failed", {
        task: "unknown",
        reason: unexpected.message,
      });
    },
  });
};

const runCommandSyncTask = async (
  task: string,
  action: () => Promise<void | appErrors.CommandSyncAppError>,
  logger: LoggerPort,
): Promise<void> => {
  const result = await action().catch(
    (cause) => new appErrors.StartupTaskError({ task, cause }),
  );
  if (result instanceof Error) {
    logStartupError(logger, result);
  }
};

const runRecoveryTask = async (
  task: string,
  action: () => Promise<void | RecoveryStartupError>,
  logger: LoggerPort,
): Promise<void> => {
  const result = await action().catch(
    (cause) => new appErrors.StartupTaskError({ task, cause }),
  );
  if (result instanceof appErrors.StartupTaskError) {
    logStartupError(logger, result);
    return;
  }
  if (result instanceof Error) {
    logStartupError(
      logger,
      new appErrors.StartupTaskError({ task, cause: result }),
    );
  }
};

const runStatusTask = async (
  task: string,
  action: () => void | Error,
  logger: LoggerPort,
): Promise<void> => {
  const result = await Promise.resolve()
    .then(action)
    .catch((cause) => new appErrors.StartupTaskError({ task, cause }));
  if (!(result instanceof Error)) {
    return;
  }

  logStartupError(
    logger,
    result instanceof appErrors.StartupTaskError
      ? result
      : new appErrors.StartupTaskError({ task, cause: result }),
  );
};

export const runStartupTasks = async ({
  commandSync,
  gameService,
  statusService,
  pregameUiSubscriber,
  gameFlowSubscriber,
  logger,
}: StartupDependencies): Promise<void> => {
  statusService.subscribe(commandSync);
  statusService.subscribe(pregameUiSubscriber);
  statusService.subscribe(gameFlowSubscriber);

  await runCommandSyncTask(
    "syncPrivateCommands",
    () => commandSync.syncPrivateCommands(),
    logger,
  );
  await runCommandSyncTask(
    "syncGroupCommands",
    () => commandSync.syncGroupCommands(),
    logger,
  );
  await runStatusTask(
    "rebuildFromRepository",
    () => statusService.rebuildFromRepository(),
    logger,
  );
  await runCommandSyncTask(
    "syncKnownChats",
    () => commandSync.syncKnownChats(),
    logger,
  );
  await runRecoveryTask(
    "recoverManualPairingPromptsOnStartup",
    () => gameService.recoverManualPairingPromptsOnStartup(),
    logger,
  );
};
