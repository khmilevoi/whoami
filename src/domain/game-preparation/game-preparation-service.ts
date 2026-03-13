import * as appErrors from "../errors.js";
import { buildRandomDerangement, validateManualPairChoice } from "../pairing.js";
import { GameStateAccessPort } from "../game-state-access/index.js";
import { GamePreparationPort } from "./game-preparation-port.js";
import { ConfigureGameInput, GameState } from "../types.js";

export class GamePreparationService implements GamePreparationPort {
  constructor(private readonly state: GameStateAccessPort) {}

  configureGame(game: GameState, input: ConfigureGameInput, now: string) {
    if (game.stage !== "CONFIGURING") {
      return new appErrors.GameCanBeConfiguredOnlyAfterLobbyClosedError();
    }
    if (input.actorPlayerId !== game.creatorPlayerId) {
      return new appErrors.OnlyGameCreatorCanConfigureError();
    }
    if (input.mode === "NORMAL" && !input.pairingMode) {
      return new appErrors.PairingModeRequiredForNormalModeError();
    }

    game.config = {
      mode: input.mode,
      playMode: input.playMode,
      pairingMode: input.pairingMode,
    };

    for (const player of game.players) {
      player.stage = "WORD_DRAFT";
    }

    game.stage = "PREPARE_WORDS";
    game.pairings = {};
    game.words = {};

    if (input.mode === "NORMAL") {
      const ids = game.players.map((player) => player.id);
      if (input.pairingMode === "RANDOM") {
        const pairings = buildRandomDerangement(ids);
        if (pairings instanceof Error) return pairings;

        game.pairings = pairings;
        game.words = this.state.initWordsForNormal(game.pairings);
      } else {
        game.preparation.manualPairingQueue = ids;
        game.preparation.manualPairingCursor = 0;
      }
    } else {
      for (const player of game.players) {
        game.words[player.id] = {
          ownerPlayerId: player.id,
          targetPlayerId: player.id,
          wordConfirmed: false,
          finalConfirmed: false,
          solved: false,
        };
      }
    }

    return this.state.touch(game, now);
  }

  selectManualPair(
    game: GameState,
    chooserPlayerId: string,
    targetPlayerId: string,
    now: string,
  ) {
    const stageError = this.state.mustBeStage(game, "PREPARE_WORDS");
    if (stageError instanceof Error) return stageError;

    if (
      !game.config ||
      game.config.mode !== "NORMAL" ||
      game.config.pairingMode !== "MANUAL"
    ) {
      return new appErrors.ManualPairingAvailableOnlyForNormalManualModeError();
    }

    const queue = game.preparation.manualPairingQueue;
    const current = queue[game.preparation.manualPairingCursor];
    if (chooserPlayerId !== current) {
      return new appErrors.NotPlayersTurnToPickPairError();
    }

    const validationError = validateManualPairChoice(
      chooserPlayerId,
      targetPlayerId,
      game.pairings,
      queue,
    );
    if (validationError instanceof Error) return validationError;

    game.pairings[chooserPlayerId] = targetPlayerId;
    game.preparation.manualPairingCursor += 1;

    if (game.preparation.manualPairingCursor >= queue.length) {
      game.words = this.state.initWordsForNormal(game.pairings);
    }

    return this.state.touch(game, now);
  }
}


