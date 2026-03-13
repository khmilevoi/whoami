import * as appErrors from "../../domain/errors.js";
import {
  ConfigureGameInput,
  GameMode,
  PairingMode,
  PlayMode,
} from "../../domain/types.js";
import type { ConfigurationStageError } from "../errors.js";
import { GameServiceContext } from "../game-service-context.js";
import { PregameUiSyncService } from "../pregame-ui-sync-service.js";
import { ConfigDraftStore } from "../stores/config-draft-store.js";
import { NormalPairingStageService } from "./normal-pairing-stage-service.js";
import { WordPreparationStageService } from "./word-preparation-stage-service.js";

export class ConfigurationStageService {
  constructor(
    private readonly context: GameServiceContext,
    private readonly configDraftStore: ConfigDraftStore,
    private readonly normalPairingStage: NormalPairingStageService,
    private readonly wordPreparationStage: WordPreparationStageService,
    private readonly pregameUiSync: PregameUiSyncService,
  ) {}

  async applyConfigStep(
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

    const draft = this.configDraftStore.get(gameId);

    if (key === "mode") {
      draft.mode = value as GameMode;
      draft.pairingMode = undefined;
    }
    if (key === "play") {
      draft.playMode = value as PlayMode;
    }
    if (key === "pair") {
      draft.pairingMode = value as PairingMode;
    }

    this.configDraftStore.set(gameId, draft);

    if (!draft.mode || !draft.playMode) {
      return this.pregameUiSync.syncGame(gameId);
    }

    if (draft.mode === "NORMAL" && !draft.pairingMode) {
      return this.pregameUiSync.syncGame(gameId);
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

    const uiSyncResult = await this.pregameUiSync.syncGame(configured.id);
    if (uiSyncResult instanceof Error) return uiSyncResult;

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

