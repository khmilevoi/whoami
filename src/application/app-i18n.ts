import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { I18n, LocaleNegotiator } from "@grammyjs/i18n";
import { Context } from "grammy";
import { DEFAULT_LOCALE } from "../domain/locale.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const resolveLocalesDirectory = (): string => {
  const checkedDirectories = [
    path.resolve(currentDir, "./locales"),
    path.resolve(currentDir, "../locales"),
    path.resolve(process.cwd(), "src/locales"),
  ];

  const existingDirectory = checkedDirectories.find(
    (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isDirectory(),
  );
  if (existingDirectory) {
    return existingDirectory;
  }

  throw new Error(
    `Locales directory not found. Checked: ${checkedDirectories.join(", ")}`,
  );
};

const localesDirectory = resolveLocalesDirectory();

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
