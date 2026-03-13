import { Context } from "grammy";
import { ConversationFlavor } from "@grammyjs/conversations";
import { I18nFlavor } from "@grammyjs/i18n";
import { SupportedLocale } from "../../domain/types.js";

export type BotContext = ConversationFlavor<Context> & I18nFlavor & { locale: SupportedLocale };
