import { GameMode, GameState, VoteDecision } from "../../domain/types";

export interface GameModeService {
  readonly mode: GameMode;
  handleGroupText(chatId: string, telegramUserId: string, text: string): Promise<void>;
  askOffline(chatId: string, telegramUserId: string): Promise<void>;
  handleVote(gameId: string, voterTelegramUserId: string, decision: VoteDecision): Promise<void>;
  giveUp(chatId: string, telegramUserId: string): Promise<void>;
  announceCurrentTurn(game: GameState): Promise<void>;
  beforeFirstTurn(game: GameState): Promise<void>;
  sendFinalSummary(game: GameState): Promise<void>;
}
