import { GameRepository, StoredPlayerProfile } from "../../src/application/ports.js";
import {
  LEGACY_LOCALE,
  normalizeLocaleSource,
  normalizeSupportedLocale,
} from "../../src/domain/locale.js";
import { GameStage, GameState } from "../../src/domain/types.js";

const activeStages = new Set<GameStage>([
  "LOBBY_OPEN",
  "LOBBY_CLOSED",
  "CONFIGURING",
  "PREPARE_WORDS",
  "READY_WAIT",
  "IN_PROGRESS",
]);

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const normalizeGame = (game: GameState, profiles: Map<string, StoredPlayerProfile>): GameState => ({
  ...game,
  groupLocale: normalizeSupportedLocale({ value: game.groupLocale, fallback: LEGACY_LOCALE }),
  players: game.players.map((player) => {
    const profile = profiles.get(player.telegramUserId);
    return {
      ...player,
      locale: normalizeSupportedLocale({
        value: player.locale ?? profile?.locale,
        fallback: LEGACY_LOCALE,
      }),
      localeSource: normalizeLocaleSource({
        value: player.localeSource ?? profile?.localeSource,
        fallback: "telegram",
      }),
    };
  }),
});

export class FakeGameRepository implements GameRepository {
  private readonly games = new Map<string, GameState>();
  private readonly playerProfiles = new Map<string, StoredPlayerProfile>();

  create(game: GameState): void {
    if (this.games.has(game.id)) {
      throw new Error(`Game ${game.id} already exists`);
    }

    this.ensureActiveChatConstraint(game, game.id);
    this.syncPlayerProfiles(game);
    this.games.set(game.id, clone(normalizeGame(game, this.playerProfiles)));
  }

  update(game: GameState): void {
    if (!this.games.has(game.id)) {
      throw new Error(`Game ${game.id} not found`);
    }

    this.ensureActiveChatConstraint(game, game.id);
    this.syncPlayerProfiles(game);
    this.games.set(game.id, clone(normalizeGame(game, this.playerProfiles)));
  }

  findById(gameId: string): GameState | null {
    const game = this.games.get(gameId);
    return game ? clone(normalizeGame(game, this.playerProfiles)) : null;
  }

  findActiveByChatId(chatId: string): GameState | null {
    const matched = Array.from(this.games.values())
      .filter((game) => game.chatId === chatId && activeStages.has(game.stage))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

    const latest = matched[0];
    return latest ? clone(normalizeGame(latest, this.playerProfiles)) : null;
  }

  listActiveGames(): GameState[] {
    return Array.from(this.games.values())
      .filter((game) => activeStages.has(game.stage))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((game) => clone(normalizeGame(game, this.playerProfiles)));
  }

  listKnownChatIds(): string[] {
    const latestByChat = new Map<string, string>();

    for (const game of this.games.values()) {
      const previous = latestByChat.get(game.chatId);
      if (!previous || game.updatedAt > previous) {
        latestByChat.set(game.chatId, game.updatedAt);
      }
    }

    return [...latestByChat.entries()]
      .sort((left, right) => {
        const byUpdatedAt = right[1].localeCompare(left[1]);
        if (byUpdatedAt !== 0) {
          return byUpdatedAt;
        }

        return left[0].localeCompare(right[0]);
      })
      .map(([chatId]) => chatId);
  }

  listKnownTelegramUserIdsByChatId(chatId: string): string[] {
    const userIds = new Set<string>();

    for (const game of this.games.values()) {
      if (game.chatId !== chatId) {
        continue;
      }

      for (const player of game.players) {
        userIds.add(player.telegramUserId);
      }
    }

    return [...userIds].sort((left, right) => left.localeCompare(right));
  }

  findPlayerProfileByTelegramUserId(telegramUserId: string): StoredPlayerProfile | null {
    return clone(this.playerProfiles.get(telegramUserId) ?? null);
  }

  upsertPlayerProfile(profile: StoredPlayerProfile): void {
    const existing = this.playerProfiles.get(profile.telegramUserId);
    this.playerProfiles.set(profile.telegramUserId, {
      ...profile,
      createdAt: existing?.createdAt ?? profile.createdAt,
      locale: normalizeSupportedLocale({ value: profile.locale, fallback: LEGACY_LOCALE }),
      localeSource: normalizeLocaleSource({
        value: profile.localeSource,
        fallback: "telegram",
      }),
    });
  }

  private syncPlayerProfiles(game: GameState): void {
    for (const player of game.players) {
      this.upsertPlayerProfile({
        id: player.id,
        telegramUserId: player.telegramUserId,
        username: player.username,
        displayName: player.displayName,
        locale: normalizeSupportedLocale({ value: player.locale, fallback: LEGACY_LOCALE }),
        localeSource: normalizeLocaleSource({
          value: player.localeSource,
          fallback: "telegram",
        }),
        createdAt: player.joinedAt,
      });
    }
  }

  private ensureActiveChatConstraint(next: GameState, currentId: string): void {
    if (!activeStages.has(next.stage)) {
      return;
    }

    const conflict = Array.from(this.games.values()).find(
      (existing) =>
        existing.id !== currentId &&
        existing.chatId === next.chatId &&
        activeStages.has(existing.stage),
    );

    if (conflict) {
      throw new Error(`Active game for chat ${next.chatId} already exists`);
    }
  }
}
