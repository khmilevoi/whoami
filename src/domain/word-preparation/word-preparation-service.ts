import * as appErrors from "../errors.js";
import { GameStateAccessPort } from "../game-state-access/index.js";
import { WordPreparationPort } from "./word-preparation-port.js";
import { GameState } from "../types.js";

export class WordPreparationService implements WordPreparationPort {
  constructor(private readonly state: GameStateAccessPort) {}

  submitWord(game: GameState, playerId: string, word: string, now: string) {
    const stageError = this.state.mustBeWordStage(game);
    if (stageError instanceof Error) return stageError;

    const normalized = word.trim();
    if (normalized.length < 1) {
      return new appErrors.WordCannotBeEmptyError();
    }

    const entry = this.state.mustGetWordEntry(game, playerId);
    if (entry instanceof Error) return entry;

    entry.word = normalized;
    entry.clue = undefined;
    entry.wordConfirmed = false;
    entry.finalConfirmed = false;

    const player = this.state.mustGetPlayer(game, playerId);
    if (player instanceof Error) return player;

    player.stage = "WORD_DRAFT";
    return this.state.touch(game, now);
  }

  confirmWord(
    game: GameState,
    playerId: string,
    confirmed: boolean,
    now: string,
  ) {
    const stageError = this.state.mustBeWordStage(game);
    if (stageError instanceof Error) return stageError;

    const entry = this.state.mustGetWordEntry(game, playerId);
    if (entry instanceof Error) return entry;

    const player = this.state.mustGetPlayer(game, playerId);
    if (player instanceof Error) return player;

    if (!confirmed) {
      entry.word = undefined;
      entry.clue = undefined;
      entry.wordConfirmed = false;
      entry.finalConfirmed = false;
      player.stage = "WORD_DRAFT";
      return this.state.touch(game, now);
    }

    if (!entry.word) {
      return new appErrors.WordMustBeSubmittedBeforeConfirmationError();
    }

    entry.wordConfirmed = true;
    player.stage = "WORD_CONFIRMED";
    return this.state.touch(game, now);
  }

  submitClue(
    game: GameState,
    playerId: string,
    clue: string | undefined,
    now: string,
  ) {
    const stageError = this.state.mustBeWordStage(game);
    if (stageError instanceof Error) return stageError;

    const entry = this.state.mustGetWordEntry(game, playerId);
    if (entry instanceof Error) return entry;

    if (!entry.wordConfirmed) {
      return new appErrors.WordMustBeConfirmedBeforeClueSubmissionError();
    }

    entry.clue = clue?.trim() || undefined;
    return this.state.touch(game, now);
  }

  finalizeWord(
    game: GameState,
    playerId: string,
    confirmed: boolean,
    now: string,
  ) {
    const stageError = this.state.mustBeWordStage(game);
    if (stageError instanceof Error) return stageError;

    const entry = this.state.mustGetWordEntry(game, playerId);
    if (entry instanceof Error) return entry;

    const player = this.state.mustGetPlayer(game, playerId);
    if (player instanceof Error) return player;

    if (!confirmed) {
      entry.word = undefined;
      entry.clue = undefined;
      entry.wordConfirmed = false;
      entry.finalConfirmed = false;
      player.stage = "WORD_DRAFT";
      return this.state.touch(game, now);
    }

    if (!entry.wordConfirmed) {
      return new appErrors.WordMustBeConfirmedBeforeFinalizationError();
    }

    entry.finalConfirmed = true;
    player.stage = "READY";

    if (this.state.allWordsReady(game)) {
      game.stage = "READY_WAIT";
    }

    return this.state.touch(game, now);
  }

  startGameIfReady(game: GameState, now: string) {
    if (game.stage !== "READY_WAIT") {
      return this.state.touch(game, now);
    }

    if (!this.state.allWordsReady(game)) {
      return new appErrors.NotAllPlayersConfirmedWordsError();
    }

    game.stage = "IN_PROGRESS";
    game.inProgress.round = 1;

    if (!game.config) {
      return new appErrors.GameConfigurationMissingError();
    }

    if (game.config.mode === "NORMAL") {
      game.inProgress.turnOrder = game.players.map((player) => player.id);
      game.inProgress.turnCursor = 0;
      game.inProgress.currentTargetPlayerId = undefined;
      game.inProgress.targetCursor = 0;
      return this.state.touch(game, now);
    }

    const ids = game.players.map((player) => player.id);
    game.inProgress.targetCursor = 0;
    game.inProgress.currentTargetPlayerId = ids[0];
    game.inProgress.turnOrder = ids.filter((playerId) => playerId !== ids[0]);
    game.inProgress.turnCursor = 0;

    return this.state.touch(game, now);
  }
}


