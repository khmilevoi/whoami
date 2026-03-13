import * as appErrors from "../errors.js";
import { AskQuestionInput, CastVoteInput, GiveUpInput } from "../round-action-input/index.js";
import { GameState } from "../types.js";

export interface ReverseRoundPort {
  askQuestion(
    game: GameState,
    input: AskQuestionInput,
  ): GameState | appErrors.AskQuestionError;
  castVote(
    game: GameState,
    input: CastVoteInput,
  ): GameState | appErrors.CastVoteError;
  giveUp(
    game: GameState,
    input: GiveUpInput,
  ): GameState | appErrors.GiveUpError;
}
