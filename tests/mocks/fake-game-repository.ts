import { GameRepository } from "../../src/application/ports";
import { GameStage, GameState } from "../../src/domain/types";

const activeStages = new Set<GameStage>([
  "LOBBY_OPEN",
  "LOBBY_CLOSED",
  "CONFIGURING",
  "PREPARE_WORDS",
  "READY_WAIT",
  "IN_PROGRESS",
]);

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export class FakeGameRepository implements GameRepository {
  private readonly games = new Map<string, GameState>();

  create(game: GameState): void {
    if (this.games.has(game.id)) {
      throw new Error(`Game ${game.id} already exists`);
    }

    this.ensureActiveChatConstraint(game, game.id);
    this.games.set(game.id, clone(game));
  }

  update(game: GameState): void {
    if (!this.games.has(game.id)) {
      throw new Error(`Game ${game.id} not found`);
    }

    this.ensureActiveChatConstraint(game, game.id);
    this.games.set(game.id, clone(game));
  }

  findById(gameId: string): GameState | null {
    const game = this.games.get(gameId);
    return game ? clone(game) : null;
  }

  findActiveByChatId(chatId: string): GameState | null {
    const matched = Array.from(this.games.values())
      .filter((game) => game.chatId === chatId && activeStages.has(game.stage))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

    const latest = matched[0];
    return latest ? clone(latest) : null;
  }

  listActiveGames(): GameState[] {
    return Array.from(this.games.values())
      .filter((game) => activeStages.has(game.stage))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((game) => clone(game));
  }

  private ensureActiveChatConstraint(next: GameState, currentId: string): void {
    if (!activeStages.has(next.stage)) {
      return;
    }

    const conflict = Array.from(this.games.values()).find(
      (existing) => existing.id !== currentId && existing.chatId === next.chatId && activeStages.has(existing.stage),
    );

    if (conflict) {
      throw new Error(`Active game for chat ${next.chatId} already exists`);
    }
  }
}
