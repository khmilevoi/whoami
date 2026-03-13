import * as appErrors from "../errors.js";
import { ConfigureGameInput, GameState } from "../types.js";

export interface GamePreparationPort {
  configureGame(
    game: GameState,
    input: ConfigureGameInput,
    now: string,
  ): GameState | appErrors.ConfigureGameError;
  selectManualPair(
    game: GameState,
    chooserPlayerId: string,
    targetPlayerId: string,
    now: string,
  ): GameState | appErrors.SelectManualPairError;
}
