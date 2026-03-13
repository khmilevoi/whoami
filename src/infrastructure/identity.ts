import { IdentityPort } from "../application/ports.js";
import { LEGACY_LOCALE, normalizeLocaleSource, normalizeSupportedLocale } from "../domain/locale.js";
import { PlayerIdentity } from "../domain/types.js";

export class TelegramIdentityPort implements IdentityPort {
  toPlayerIdentity(input: {
    telegramUserId: string;
    username?: string;
    firstName?: string;
    lastName?: string;
    languageCode?: string;
    locale?: PlayerIdentity["locale"];
    localeSource?: PlayerIdentity["localeSource"];
  }): PlayerIdentity {
    const display =
      [input.firstName, input.lastName].filter(Boolean).join(" ").trim() ||
      input.username ||
      input.telegramUserId;

    return {
      id: `tg:${input.telegramUserId}`,
      telegramUserId: input.telegramUserId,
      username: input.username,
      displayName: display,
      locale: normalizeSupportedLocale({
        value: input.locale ?? input.languageCode,
        fallback: LEGACY_LOCALE,
      }),
      localeSource: normalizeLocaleSource({
        value: input.localeSource,
        fallback: "telegram",
      }),
    };
  }
}
