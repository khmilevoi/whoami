import * as appErrors from "../errors.js";
import { GameState, PlayerIdentity, PlayerProgress, PlayerState, WordEntry } from "../types.js";

export interface GameStateAccessPort {
  mustBeWordStage(
    game: GameState,
  ): void | appErrors.WordActionsNotAvailableInCurrentStageError;
  mustBeStage(
    game: GameState,
    stage: GameState["stage"],
  ): void | appErrors.ExpectedStageMismatchError;
  mustGetPlayer(
    game: GameState,
    playerId: string,
  ): PlayerState | appErrors.PlayerNotFoundError;
  mustGetProgress(
    game: GameState,
    playerId: string,
  ): PlayerProgress | appErrors.PlayerNotFoundError;
  mustGetWordEntry(
    game: GameState,
    playerId: string,
  ): WordEntry | appErrors.WordEntryForPlayerMissingError;
  toPlayerState(player: PlayerIdentity, now: string): PlayerState;
  touch(game: GameState, now: string): GameState;
  initWordsForNormal(pairings: Record<string, string>): Record<string, WordEntry>;
  allWordsReady(game: GameState): boolean;
  finishGame(
    game: GameState,
    now: string,
  ): void | appErrors.GameConfigurationMissingError | appErrors.PlayerNotFoundError;
}
