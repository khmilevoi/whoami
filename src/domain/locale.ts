import { GameState, LocaleSource, PlayerState, SupportedLocale } from "./types.js";

export const SUPPORTED_LOCALES = ["ru", "en"] as const satisfies readonly SupportedLocale[];
export const DEFAULT_LOCALE: SupportedLocale = "en";
export const LEGACY_LOCALE: SupportedLocale = "ru";

export const normalizeSupportedLocale = ({
  value,
  fallback = DEFAULT_LOCALE,
}: {
  value?: string | null;
  fallback?: SupportedLocale;
}): SupportedLocale => {
  const normalized = value?.toLowerCase().trim();
  if (normalized?.startsWith("ru")) {
    return "ru";
  }
  if (normalized?.startsWith("en")) {
    return "en";
  }
  return fallback;
};

export const normalizeLocaleSource = ({
  value,
  fallback = "telegram",
}: {
  value?: string | null;
  fallback?: LocaleSource;
}): LocaleSource => {
  return value === "explicit" || value === "telegram" ? value : fallback;
};

export const resolvePlayerLocale = ({
  player,
  fallback = LEGACY_LOCALE,
}: {
  player?: Pick<PlayerState, "locale"> | null;
  fallback?: SupportedLocale;
}): SupportedLocale => normalizeSupportedLocale({ value: player?.locale, fallback });

export const resolvePlayerLocaleSource = ({
  player,
  fallback = "telegram",
}: {
  player?: Pick<PlayerState, "localeSource"> | null;
  fallback?: LocaleSource;
}): LocaleSource =>
  normalizeLocaleSource({ value: player?.localeSource, fallback });

export const resolveGameLocale = ({
  game,
  fallback = LEGACY_LOCALE,
}: {
  game?: Pick<GameState, "groupLocale"> | null;
  fallback?: SupportedLocale;
}): SupportedLocale => normalizeSupportedLocale({ value: game?.groupLocale, fallback });
