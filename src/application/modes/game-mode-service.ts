import type { NotificationError } from "../../domain/errors";
import { GameMode, GameState, VoteDecision } from "../../domain/types";
import type { GiveUpHandlingError, StartQuestionError, VoteHandlingError } from "../errors";

export interface GameModeService {
  readonly mode: GameMode;
  handleGroupText(chatId: string, telegramUserId: string, text: string): Promise<void | StartQuestionError>;
  askOffline(chatId: string, telegramUserId: string): Promise<void | StartQuestionError>;
  handleVote(gameId: string, voterTelegramUserId: string, decision: VoteDecision): Promise<void | VoteHandlingError>;
  giveUp(chatId: string, telegramUserId: string): Promise<void | GiveUpHandlingError>;
  announceCurrentTurn(game: GameState): Promise<void | NotificationError>;
  beforeFirstTurn(game: GameState): Promise<void>;
  sendFinalSummary(game: GameState): Promise<void | NotificationError>;
}
