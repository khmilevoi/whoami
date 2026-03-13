import { MiddlewareFn } from "grammy";
import { createBaseI18n } from "../../application/app-i18n.js";
import { GameRepository } from "../../application/ports.js";
import { DEFAULT_LOCALE, normalizeSupportedLocale } from "../../domain/locale.js";
import { BotContext } from "./bot-context.js";

const isGroupChat = (ctx: BotContext): boolean => {
  const type = ctx.chat?.type;
  return type === "group" || type === "supergroup";
};

export const createTelegramI18n = (repository: GameRepository) =>
  createBaseI18n<BotContext>({
    localeNegotiator: async (ctx) => {
      if (isGroupChat(ctx) && ctx.chat) {
        const game = repository.findActiveByChatId(String(ctx.chat.id));
        if (game?.groupLocale) {
          return normalizeSupportedLocale({ value: game.groupLocale });
        }
      }

      if (ctx.from) {
        const profile = repository.findPlayerProfileByTelegramUserId(String(ctx.from.id));
        if (profile?.locale) {
          return normalizeSupportedLocale({ value: profile.locale });
        }

        return normalizeSupportedLocale({
          value: ctx.from.language_code,
          fallback: DEFAULT_LOCALE,
        });
      }

      return DEFAULT_LOCALE;
    },
  });

export const bindResolvedLocale = (): MiddlewareFn<BotContext> => {
  return async (ctx, next) => {
    ctx.locale = normalizeSupportedLocale({ value: await ctx.i18n.getLocale() });
    await next();
  };
};