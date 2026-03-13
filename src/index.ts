import { autoRetry } from "@grammyjs/auto-retry";
import { hydrate } from "@grammyjs/hydrate";
import { I18n } from "@grammyjs/i18n";
import * as appErrors from "./domain/errors.js";
import { AwilixContainer } from "awilix";
import { Bot } from "grammy";
import { buildHttpServer } from "./adapters/http/server.js";
import { registerTelegramHandlers } from "./adapters/telegram/telegram-bot.js";
import { TelegramCommandSync } from "./adapters/telegram/telegram-command-sync.js";
import { bindResolvedLocale } from "./adapters/telegram/telegram-i18n.js";
import { BotContext } from "./adapters/telegram/bot-context.js";
import { GameService } from "./application/game-service.js";
import {
  GameStatusService,
  GameStatusSubscriber,
} from "./application/game-status-service.js";
import { LoggerPort } from "./application/ports.js";
import { TextService } from "./application/text-service.js";
import { loadConfig } from "./config.js";
import { buildContainer } from "./container.js";
import { runStartupTasks } from "./startup.js";

const start = (): void | appErrors.StartAppError => {
  const config = loadConfig();

  if (!config.botToken) {
    return new appErrors.MissingBotTokenError();
  }

  const container: AwilixContainer = buildContainer(config);
  const bot = container.resolve<Bot<BotContext>>("bot");
  bot.api.config.use(autoRetry());
  bot.use(hydrate() as never);
  const i18n = container.resolve<I18n<BotContext>>("i18n");
  bot.use(i18n);
  bot.use(bindResolvedLocale());

  const logger = container.resolve<LoggerPort>("logger");
  const texts = container.resolve<TextService>("texts");
  const gameService = container.resolve<GameService>("gameService");
  const commandSync = container.resolve<TelegramCommandSync>("commandSync");
  const statusService = container.resolve<GameStatusService>("statusService");
  const pregameUiSubscriber = container.resolve<GameStatusSubscriber>(
    "pregameUiSubscriber",
  );
  const gameFlowSubscriber = container.resolve<GameStatusSubscriber>(
    "gameFlowSubscriber",
  );

  registerTelegramHandlers(
    bot,
    gameService,
    logger,
    texts,
    config.botUsername,
    commandSync,
  );

  const app = buildHttpServer(bot, logger);
  const initializeRuntime = async (): Promise<void> => {
    await runStartupTasks({
      commandSync,
      gameService,
      statusService,
      pregameUiSubscriber,
      gameFlowSubscriber,
      logger,
    });

    if (config.webhookUrl) {
      const webhook = `${config.webhookUrl.replace(/\/$/, "")}/telegram/webhook`;
      const webhookResult = await bot.api.setWebhook(webhook).catch(
        (error) =>
          new appErrors.TelegramApiError({
            operation: "setWebhook",
            cause: error,
          }),
      );
      if (webhookResult instanceof Error) {
        logger.error("telegram_webhook_set_failed", {
          reason: webhookResult.message,
        });
        return;
      }

      logger.info("telegram_webhook_set", { webhook });
      return;
    }

    void bot.start();
    logger.info("telegram_polling_started");
  };

  app.listen(config.appPort, () => {
    logger.info("http_started", { port: config.appPort });

    void initializeRuntime().catch((error: unknown) => {
      logger.error("startup_failed", {
        reason: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    });
  });
};

const result = start();
if (result instanceof Error) {
  console.error(result);
  process.exit(1);
}