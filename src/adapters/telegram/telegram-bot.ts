import * as errore from "errore";
import * as appErrors from "../../domain/errors.js";
import { SupportedLocale } from "../../domain/types.js";
import { Bot } from "grammy";
import { GameService } from "../../application/game-service.js";
import type { TelegramHandlerError } from "../../application/errors.js";
import { LoggerPort } from "../../application/ports.js";
import { TextService } from "../../application/text-service.js";
import { TelegramCommandSync } from "./telegram-command-sync.js";

import { parseManualPairPayload } from "./manual-pair-payload.js";
import { parseStartPayload } from "./start-payload.js";
import { BotContext } from "./bot-context.js";

const asActor = (ctx: BotContext) => ({
  telegramUserId: String(ctx.from?.id ?? ""),
  username: ctx.from?.username,
  firstName: ctx.from?.first_name,
  lastName: ctx.from?.last_name,
  languageCode: ctx.from?.language_code,
});

const isPrivate = (ctx: BotContext): boolean => ctx.chat?.type === "private";

const isGroupChat = (ctx: BotContext): boolean => {
  const type = ctx.chat?.type;
  return type === "group" || type === "supergroup";
};

const localizedTexts = (texts: TextService, ctx: BotContext): TextService =>
  texts.forLocale(ctx.locale);

const safeReply = async (ctx: BotContext, text: string, replyMarkup?: unknown): Promise<void> => {
  if (ctx.chat) {
    await ctx.reply(text, replyMarkup ? ({ reply_markup: replyMarkup } as never) : undefined);
  }
};

const safeToast = async (ctx: BotContext, text: string): Promise<void> => {
  await ctx.answerCallbackQuery({
    text: text.slice(0, 180),
    show_alert: false,
  });
};

const buildLanguageKeyboard = (texts: TextService, currentLocale: SupportedLocale) => ({
  inline_keyboard: [
    [
      {
        text: `${currentLocale === "ru" ? "• " : ""}${texts.languageButton("ru")}`,
        callback_data: "lang:set:ru",
      },
      {
        text: `${currentLocale === "en" ? "• " : ""}${texts.languageButton("en")}`,
        callback_data: "lang:set:en",
      },
    ],
  ],
});

const buildPrivateLink = (botUsername?: string): string =>
  botUsername ? `https://t.me/${botUsername}` : "https://t.me";

const maybeEnterPregameConfigConversation = async (
  ctx: BotContext,
  gameService: GameService,
  gameId?: string,
): Promise<void> => {
  if (!isPrivate(ctx)) {
    return;
  }

  const snapshot = gameService.findConfiguringGameByCreator(String(ctx.from?.id ?? ""));
  if (!snapshot) {
    return;
  }

  if (gameId && snapshot.gameId !== gameId) {
    return;
  }

  await ctx.conversation.enter("pregame-config", snapshot.gameId).catch(() => undefined);
};

const replyForReturnedError = async (
  ctx: BotContext,
  logger: LoggerPort,
  texts: TextService,
  error: TelegramHandlerError,
): Promise<void> => {
  const scopedTexts = localizedTexts(texts, ctx);
  if (error instanceof appErrors.DomainAppErrorBase) {
    await safeReply(ctx, scopedTexts.renderError(error));
    return;
  }

  await errore.matchError(error, {
    TelegramApiError: async (typedError) => {
      logger.error("telegram_handler_error", {
        error: typedError.message,
        kind: typedError.name,
        updateId: ctx.update.update_id,
      });
      await safeReply(ctx, scopedTexts.genericErrorRetry());
    },
    Error: async (unexpected) => {
      logger.error("telegram_handler_error", {
        error: unexpected.message,
        kind: unexpected.name,
        updateId: ctx.update.update_id,
      });
      await safeReply(ctx, scopedTexts.genericErrorRetry());
    },
  });
};

const toastForReturnedError = async (
  ctx: BotContext,
  logger: LoggerPort,
  texts: TextService,
  error: TelegramHandlerError,
): Promise<void> => {
  const scopedTexts = localizedTexts(texts, ctx);
  if (error instanceof appErrors.DomainAppErrorBase) {
    await safeToast(ctx, scopedTexts.renderError(error));
    return;
  }

  await errore.matchError(error, {
    TelegramApiError: async (typedError) => {
      logger.error("telegram_handler_error", {
        error: typedError.message,
        kind: typedError.name,
        updateId: ctx.update.update_id,
      });
      await safeToast(ctx, scopedTexts.genericErrorRetry());
    },
    Error: async (unexpected) => {
      logger.error("telegram_handler_error", {
        error: unexpected.message,
        kind: unexpected.name,
        updateId: ctx.update.update_id,
      });
      await safeToast(ctx, scopedTexts.genericErrorRetry());
    },
  });
};

const executeWithReply = async (
  ctx: BotContext,
  logger: LoggerPort,
  texts: TextService,
  action: () => Promise<void | TelegramHandlerError>,
): Promise<void> => {
  try {
    const result = await action();
    if (result instanceof Error) {
      await replyForReturnedError(ctx, logger, texts, result);
    }
  } catch (error) {
    logger.error("telegram_handler_error", {
      error: error instanceof Error ? error.message : String(error),
      updateId: ctx.update.update_id,
    });

    await safeReply(ctx, localizedTexts(texts, ctx).genericErrorRetry());
  }
};

const executeWithToast = async (
  ctx: BotContext,
  logger: LoggerPort,
  texts: TextService,
  action: () => Promise<void | TelegramHandlerError>,
): Promise<void> => {
  try {
    const result = await action();
    if (result instanceof Error) {
      await toastForReturnedError(ctx, logger, texts, result);
    }
  } catch (error) {
    logger.error("telegram_handler_error", {
      error: error instanceof Error ? error.message : String(error),
      updateId: ctx.update.update_id,
    });

    await safeToast(ctx, localizedTexts(texts, ctx).genericErrorRetry());
  }
};

export const registerTelegramHandlers = (
  bot: Bot<BotContext>,
  gameService: GameService,
  logger: LoggerPort,
  texts: TextService,
  botUsername?: string,
  _commandSync?: TelegramCommandSync,
): void => {

  bot.command("start", async (ctx) => {
    await executeWithReply(ctx, logger, texts, async () => {
      if (!isPrivate(ctx)) {
        return;
      }

      const payload = parseStartPayload(ctx.match);
      if (payload instanceof Error) {
        return payload;
      }

      const result = await gameService.handlePrivateStart(asActor(ctx), payload);
      if (result instanceof Error) {
        return result;
      }

      if (payload?.action !== "join") {
        await maybeEnterPregameConfigConversation(ctx, gameService, payload?.gameId ?? undefined);
      }

      return;
    });
  });

  bot.command("language", async (ctx) => {
    const scopedTexts = localizedTexts(texts, ctx);
    await executeWithReply(ctx, logger, texts, async () => {
      if (!isPrivate(ctx)) {
        await safeReply(ctx, scopedTexts.languagePrivateOnly(buildPrivateLink(botUsername)));
        return;
      }

      await safeReply(
        ctx,
        scopedTexts.chooseLanguagePrompt(),
        buildLanguageKeyboard(scopedTexts, ctx.locale),
      );
    });
  });

  bot.command("whoami_start", async (ctx) => {
    await executeWithReply(ctx, logger, texts, async () => {
      if (!isGroupChat(ctx)) {
        await safeReply(ctx, localizedTexts(texts, ctx).groupOnlyCommand());
        return;
      }

      return gameService.startGame(String(ctx.chat.id), asActor(ctx));
    });
  });

  bot.command("whoami_cancel", async (ctx) => {
    await executeWithReply(ctx, logger, texts, async () => {
      if (!isGroupChat(ctx)) {
        return;
      }

      return gameService.cancel(String(ctx.chat.id), asActor(ctx));
    });
  });

  bot.command("giveup", async (ctx) => {
    await executeWithReply(ctx, logger, texts, async () => {
      if (!isGroupChat(ctx)) {
        return;
      }
      return gameService.giveUp(String(ctx.chat.id), asActor(ctx));
    });
  });

  bot.on("message:text", async (ctx) => {
    await executeWithReply(ctx, logger, texts, async () => {
      const text = ctx.message.text.trim();
      if (text.startsWith("/")) {
        return;
      }

      if (isPrivate(ctx)) {
        return gameService.handlePrivateText(asActor(ctx), text);
      }
      if (isGroupChat(ctx)) {
        return gameService.handleGroupText(String(ctx.chat.id), asActor(ctx), text);
      }

      return;
    });
  });

  bot.on("callback_query:data", async (ctx) => {
    await executeWithToast(ctx, logger, texts, async () => {
      const payload = ctx.callbackQuery.data;
      const parts = payload.split(":");
      if (parts[0] === "lang" && parts[1] === "set") {
        const locale = parts[2] as SupportedLocale;
        const result = await gameService.setUserLocalePreference(asActor(ctx), locale);
        if (result instanceof Error) return result;
        ctx.i18n.useLocale(locale);
        ctx.locale = locale;
        const nextTexts = localizedTexts(texts, ctx);
        await ctx.editMessageText(nextTexts.chooseLanguagePrompt(), {
          reply_markup: buildLanguageKeyboard(nextTexts, locale) as never,
        });
        await ctx.answerCallbackQuery({ text: nextTexts.languageUpdated(locale).slice(0, 180) });
        return;
      }

      if (parts[0] === "cfgw") {
        await ctx.answerCallbackQuery();
        return;
      }

      if (parts[0] === "ui") {
        const [, action, gameId] = parts;
        if (action === "join") {
          const result = await gameService.joinGameById(gameId, asActor(ctx));
          if (result instanceof Error) return result;
          await ctx.answerCallbackQuery();
          return;
        }

        if (action === "close-lobby") {
          const result = await gameService.beginConfigurationByGameId(gameId, asActor(ctx));
          if (result instanceof Error) return result;
          await ctx.answerCallbackQuery();
          return;
        }

        if (action === "config") {
          const result = await gameService.beginConfigurationByGameId(gameId, asActor(ctx));
          if (result instanceof Error) return result;
          await ctx.answerCallbackQuery();
          await maybeEnterPregameConfigConversation(ctx, gameService, gameId);
          return;
        }

        if (action === "open-config") {
          await ctx.answerCallbackQuery();
          await maybeEnterPregameConfigConversation(ctx, gameService, gameId);
          return;
        }
      }

      if (parts[0] === "pair") {
        const parsed = parseManualPairPayload(payload);
        if (parsed instanceof Error) return parsed;

        const result = await gameService.applyManualPair(
          parsed.gameId,
          asActor(ctx),
          parsed.targetPlayerId,
        );
        if (result instanceof Error) return result;
        await ctx.answerCallbackQuery();
        return;
      }

      if (parts[0] === "word") {
        const [, action, value, gameId] = parts;
        const result = await gameService.handleWordCallback(
          gameId,
          asActor(ctx),
          action as "confirm" | "clue" | "final",
          value as "YES" | "NO",
        );
        if (result instanceof Error) return result;
        await ctx.answerCallbackQuery();
        return;
      }

      if (parts[0] === "vote") {
        const [, value, gameId] = parts;
        const result = await gameService.handleVote(
          gameId,
          asActor(ctx),
          value as "YES" | "NO" | "GUESSED",
        );
        if (result instanceof Error) return result;
        await ctx.answerCallbackQuery();
        return;
      }

      if (parts[0] === "ask") {
        if (ctx.chat) {
          const result = await gameService.askOffline(String(ctx.chat.id), asActor(ctx));
          if (result instanceof Error) return result;
        }
        await ctx.answerCallbackQuery();
        return;
      }

      await ctx.answerCallbackQuery();
      return;
    });
  });
};






