import * as appErrors from "../errors.js";
import { GameState } from "../types.js";

export interface WordPreparationPort {
  submitWord(
    game: GameState,
    playerId: string,
    word: string,
    now: string,
  ): GameState | appErrors.SubmitWordError;
  confirmWord(
    game: GameState,
    playerId: string,
    confirmed: boolean,
    now: string,
  ): GameState | appErrors.ConfirmWordError;
  submitClue(
    game: GameState,
    playerId: string,
    clue: string | undefined,
    now: string,
  ): GameState | appErrors.SubmitClueError;
  finalizeWord(
    game: GameState,
    playerId: string,
    confirmed: boolean,
    now: string,
  ): GameState | appErrors.FinalizeWordError;
  startGameIfReady(
    game: GameState,
    now: string,
  ): GameState | appErrors.StartGameIfReadyError;
}
