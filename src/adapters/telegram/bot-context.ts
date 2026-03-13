import { Context } from "grammy";
import { I18nFlavor } from "@grammyjs/i18n";
import { SupportedLocale } from "../../domain/types.js";

export type BotContext = Context & I18nFlavor & { locale: SupportedLocale };
