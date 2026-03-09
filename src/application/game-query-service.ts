import { GameState } from "../domain/types";
import { GameRepository } from "./ports";

export class GameQueryService {
  constructor(private readonly repository: GameRepository) {}

  findActiveGameByChatId(chatId: string): GameState | null {
    return this.repository.findActiveByChatId(chatId);
  }

  listActiveChatIdsByTelegramUser(telegramUserId: string): string[] {
    const uniqueChatIds = new Set<string>();

    for (const game of this.repository.listActiveGames()) {
      const hasUser = game.players.some((player) => player.telegramUserId === telegramUserId);
      if (hasUser) {
        uniqueChatIds.add(game.chatId);
      }
    }

    return [...uniqueChatIds];
  }

  listActiveChatIds(): string[] {
    return [...new Set(this.repository.listActiveGames().map((game) => game.chatId))];
  }
}
