import { IdentityPort } from "../../src/application/ports.js";
import { LEGACY_LOCALE, normalizeLocaleSource, normalizeSupportedLocale } from "../../src/domain/locale.js";
import { PlayerIdentity } from "../../src/domain/types.js";

export class FakeIdentityPort implements IdentityPort {
  toPlayerIdentity(input: {
    telegramUserId: string;
    username?: string;
    firstName?: string;
    lastName?: string;
    languageCode?: string;
    locale?: PlayerIdentity["locale"];
    localeSource?: PlayerIdentity["localeSource"];
  }): PlayerIdentity {
    const displayName =
      [input.firstName, input.lastName].filter(Boolean).join(" ").trim() ||
      input.username ||
      input.telegramUserId;

    return {
      id: `tg:${input.telegramUserId}`,
      telegramUserId: input.telegramUserId,
      username: input.username,
      displayName,
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
