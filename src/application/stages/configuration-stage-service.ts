import * as appErrors from "../../domain/errors.js";
import {
  ConfigureGameInput,
  GameMode,
  PairingMode,
  PlayMode,
} from "../../domain/types.js";
import type { ConfigurationStageError } from "../errors.js";
import { GameServiceContext } from "../game-service-context.js";
import { ConfigDraft, ConfigDraftStore } from "../stores/config-draft-store.js";
import { NormalPairingStageService } from "./normal-pairing-stage-service.js";
import { WordPreparationStageService } from "./word-preparation-stage-service.js";

const initialDraft = (): ConfigDraft => ({
  step: "MODE",
  awaitingConfirmation: false,
});

const isDraftComplete = (draft: ConfigDraft): boolean => {
  if (!draft.mode || !draft.playMode) {
    return false;
  }

  if (draft.mode === "NORMAL") {
    return draft.pairingMode !== undefined;
  }

  return true;
};

export class ConfigurationStageService {
  constructor(
    private readonly context: GameServiceContext,
    private readonly configDraftStore: ConfigDraftStore,
    private readonly normalPairingStage: NormalPairingStageService,
    private readonly wordPreparationStage: WordPreparationStageService,
  ) {}

  async applyConfigStep(
    gameId: string,
    actorTelegramUserId: string,
    key: "mode" | "play" | "pair",
    value: string,
  ): Promise<void | ConfigurationStageError> {
    return this.saveConfigDraftStep(gameId, actorTelegramUserId, key, value);
  }

  async saveConfigDraftStep(
    gameId: string,
    actorTelegramUserId: string,
    key: "mode" | "play" | "pair",
    value: string,
  ): Promise<void | ConfigurationStageError> {
    const game = this.context.getGameByIdOrError(gameId);
    if (game instanceof Error) return game;

    const actor = this.context.getPlayerByTelegramOrError(
      game,
      actorTelegramUserId,
    );
    if (actor instanceof Error) return actor;

    if (actor.id !== game.creatorPlayerId) {
      return new appErrors.OnlyGameCreatorCanConfigureError();
    }

    const currentDraft = this.configDraftStore.get(gameId);
    const nextDraft: ConfigDraft = {
      ...currentDraft,
      awaitingConfirmation: false,
    };

    if (key === "mode") {
      nextDraft.step = "PLAY_MODE";
      nextDraft.mode = value as GameMode;
      nextDraft.playMode = undefined;
      nextDraft.pairingMode = undefined;
    }

    if (key === "play") {
      nextDraft.playMode = value as PlayMode;
      nextDraft.step = nextDraft.mode === "NORMAL" ? "PAIRING_MODE" : "CONFIRM";
    }

    if (key === "pair") {
      nextDraft.pairingMode = value as PairingMode;
      nextDraft.step = "CONFIRM";
    }

    if (isDraftComplete(nextDraft)) {
      nextDraft.awaitingConfirmation = true;
      nextDraft.step = "CONFIRM";
    }

    this.configDraftStore.set(gameId, nextDraft);
    return this.context.republishGameStatus(gameId);
  }

  async restartConfigDraft(
    gameId: string,
    actorTelegramUserId: string,
  ): Promise<void | ConfigurationStageError> {
    const game = this.context.getGameByIdOrError(gameId);
    if (game instanceof Error) return game;

    const actor = this.context.getPlayerByTelegramOrError(
      game,
      actorTelegramUserId,
    );
    if (actor instanceof Error) return actor;

    if (actor.id !== game.creatorPlayerId) {
      return new appErrors.OnlyGameCreatorCanConfigureError();
    }

    this.configDraftStore.set(gameId, initialDraft());
    return this.context.republishGameStatus(gameId);
  }

  async confirmConfigDraft(
    gameId: string,
    actorTelegramUserId: string,
  ): Promise<void | ConfigurationStageError> {
    const game = this.context.getGameByIdOrError(gameId);
    if (game instanceof Error) return game;

    const actor = this.context.getPlayerByTelegramOrError(
      game,
      actorTelegramUserId,
    );
    if (actor instanceof Error) return actor;

    if (actor.id !== game.creatorPlayerId) {
      return new appErrors.OnlyGameCreatorCanConfigureError();
    }

    const draft = this.configDraftStore.get(gameId);
    if (!draft.mode || !draft.playMode) {
      return this.context.republishGameStatus(gameId);
    }

    if (draft.mode === "NORMAL" && !draft.pairingMode) {
      return this.context.republishGameStatus(gameId);
    }

    const configured = this.context.transactionRunner.runInTransaction(() => {
      const current = this.context.getGameByIdOrError(gameId);
      if (current instanceof Error) return current;

      const updateInput: ConfigureGameInput = {
        actorPlayerId: actor.id,
        mode: draft.mode!,
        playMode: draft.playMode!,
        pairingMode: draft.mode === "NORMAL" ? draft.pairingMode : undefined,
      };

      const updated = this.context.engine.configureGame(
        current,
        updateInput,
        this.context.clock.nowIso(),
      );
      if (updated instanceof Error) return updated;

      this.context.repository.update(updated);
      return updated;
    });
    if (configured instanceof Error) return configured;

    this.configDraftStore.delete(gameId);

    this.context.publishGameStatus(configured);

    if (
      configured.config?.mode === "NORMAL" &&
      configured.config.pairingMode === "MANUAL" &&
      Object.keys(configured.words).length === 0
    ) {
      return this.normalPairingStage.promptCurrentChooser(configured);
    }

    return this.wordPreparationStage.promptWordCollection(configured);
  }
}
