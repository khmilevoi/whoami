import { GameState } from "../domain/types.js";
import { ConfigDraft } from "./stores/config-draft-store.js";

export interface StepProgress {
  currentStep: number;
  totalSteps: number;
  remainingSteps: number;
}

export interface ManualPairingProgress extends StepProgress {
  chooserPlayerId?: string;
  queuePositionByPlayer: Record<string, number>;
}

const inferConfigStep = (draft: ConfigDraft): ConfigDraft["step"] => {
  if (draft.step) {
    return draft.step;
  }

  if (!draft.mode) {
    return "MODE";
  }

  if (!draft.playMode) {
    return "PLAY_MODE";
  }

  if (draft.mode === "NORMAL" && !draft.pairingMode) {
    return "PAIRING_MODE";
  }

  return "CONFIRM";
};

export const getConfigProgress = (draft: ConfigDraft): StepProgress => {
  const totalSteps = draft.mode === "REVERSE" ? 3 : 4;
  const step = inferConfigStep(draft);
  const currentStep =
    step === "MODE"
      ? 1
      : step === "PLAY_MODE"
        ? 2
        : step === "PAIRING_MODE"
          ? 3
          : totalSteps;

  return {
    currentStep,
    totalSteps,
    remainingSteps: Math.max(totalSteps - currentStep, 0),
  };
};

export const isManualPairingPending = (game: GameState): boolean =>
  game.stage === "PREPARE_WORDS" &&
  game.config?.mode === "NORMAL" &&
  game.config.pairingMode === "MANUAL" &&
  Object.keys(game.words).length < game.players.length;

export const getManualPairingProgress = (
  game: GameState,
): ManualPairingProgress => {
  const queue = game.preparation.manualPairingQueue;
  const cursor = game.preparation.manualPairingCursor;

  return {
    chooserPlayerId: queue[cursor],
    currentStep: Math.min(cursor + 1, Math.max(queue.length, 1)),
    totalSteps: Math.max(queue.length, 1),
    remainingSteps: Math.max(queue.length - cursor, 0),
    queuePositionByPlayer: Object.fromEntries(
      queue.map((playerId, index) => [playerId, index < cursor ? 0 : index - cursor + 1]),
    ),
  };
};
