import * as appErrors from "../errors.js";
import { buildGameResult } from "../stats.js";
import { GameStateAccessPort } from "./game-state-access-port.js";
import { GameState, PlayerIdentity, PlayerProgress, PlayerState, WordEntry } from "../types.js";

export const terminalPlayerStages = new Set(["GUESSED", "GAVE_UP"]);

export class GameStateAccessService implements GameStateAccessPort {
  mustBeWordStage(game: GameState): void | appErrors.WordActionsNotAvailableInCurrentStageError {
    if (game.stage !== "PREPARE_WORDS" && game.stage !== "READY_WAIT") {
      return new appErrors.WordActionsNotAvailableInCurrentStageError();
    }

    return;
  }

  mustBeStage(
    game: GameState,
    stage: GameState["stage"],
  ): void | appErrors.ExpectedStageMismatchError {
    if (game.stage !== stage) {
      return new appErrors.ExpectedStageMismatchError({
        expectedStage: stage,
        actualStage: game.stage,
      });
    }

    return;
  }

  mustGetPlayer(game: GameState, playerId: string) {
    const player = game.players.find((candidate) => candidate.id === playerId);
    if (!player) {
      return new appErrors.PlayerNotFoundError();
    }

    return player;
  }

  mustGetProgress(
    game: GameState,
    playerId: string,
  ): PlayerProgress | appErrors.PlayerNotFoundError {
    const progress = game.progress[playerId];
    if (!progress) {
      return new appErrors.PlayerNotFoundError();
    }

    return progress;
  }

  mustGetWordEntry(
    game: GameState,
    playerId: string,
  ): WordEntry | appErrors.WordEntryForPlayerMissingError {
    const entry = game.words[playerId];
    if (!entry) {
      return new appErrors.WordEntryForPlayerMissingError();
    }

    return entry;
  }

  toPlayerState(player: PlayerIdentity, now: string): PlayerState {
    return {
      id: player.id,
      telegramUserId: player.telegramUserId,
      username: player.username,
      displayName: player.displayName,
      stage: "JOINED",
      dmOpened: false,
      joinedAt: now,
    };
  }

  touch(game: GameState, now: string): GameState {
    game.updatedAt = now;
    return game;
  }

  initWordsForNormal(pairings: Record<string, string>): Record<string, WordEntry> {
    const words: Record<string, WordEntry> = {};

    for (const [owner, target] of Object.entries(pairings)) {
      words[owner] = {
        ownerPlayerId: owner,
        targetPlayerId: target,
        wordConfirmed: false,
        finalConfirmed: false,
        solved: false,
      };
    }

    return words;
  }

  allWordsReady(game: GameState): boolean {
    const wordEntries = Object.values(game.words);
    if (wordEntries.length !== game.players.length) {
      return false;
    }

    return wordEntries.every((entry) =>
      Boolean(entry.word && entry.wordConfirmed && entry.finalConfirmed),
    );
  }

  finishGame(
    game: GameState,
    now: string,
  ): void | appErrors.GameConfigurationMissingError | appErrors.PlayerNotFoundError {
    game.stage = "FINISHED";
    const result = buildGameResult(game, now);
    if (result instanceof Error) return result;

    game.result = result;
    return;
  }
}

