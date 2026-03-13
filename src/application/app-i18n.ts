import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { I18n, LocaleNegotiator } from "@grammyjs/i18n";
import { Context } from "grammy";
import { DEFAULT_LOCALE } from "../domain/locale.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const localesDirectory = path.resolve(currentDir, "../locales");

if (!fs.existsSync(localesDirectory)) {
  throw new Error(`Locales directory not found: ${localesDirectory}`);
}

export interface TranslationBackend {
  t(locale: string, key: string, variables?: Record<string, unknown>): string;
}

export interface CreateBaseI18nOptions<C extends Context = Context> {
  localeNegotiator?: LocaleNegotiator<C>;
}

export const createBaseI18n = <C extends Context = Context>(
  options: CreateBaseI18nOptions<C> = {},
) =>
  new I18n<C>({
    defaultLocale: DEFAULT_LOCALE,
    directory: localesDirectory,
    localeNegotiator: options.localeNegotiator,
    fluentBundleOptions: {
      useIsolating: false,
    },
  });