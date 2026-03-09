import * as appErrors from "../../domain/errors";
import { ConfigureGameInput, GameMode, PairingMode, PlayMode } from "../../domain/types";
import type { ConfigurationStageError } from "../errors";
import { GameServiceContext } from "../game-service-context";
import { ConfigDraftStore } from "../stores/config-draft-store";
import { NormalPairingStageService } from "./normal-pairing-stage-service";
import { WordPreparationStageService } from "./word-preparation-stage-service";

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
    const game = this.context.getGameByIdOrError(gameId);
    if (game instanceof Error) return game;

    const actor = this.context.getPlayerByTelegramOrError(game, actorTelegramUserId);
    if (actor instanceof Error) return actor;

    if (actor.id !== game.creatorPlayerId) {
      return new appErrors.OnlyGameCreatorCanConfigureError();
    }

    const draft = this.configDraftStore.get(gameId);

    if (key === "mode") {
      draft.mode = value as GameMode;
    }
    if (key === "play") {
      draft.playMode = value as PlayMode;
    }
    if (key === "pair") {
      draft.pairingMode = value as PairingMode;
    }

    this.configDraftStore.set(gameId, draft);

    if (!draft.mode) {
      return;
    }

    if (!draft.playMode) {
      const sentPrompt = await this.context.notifier.sendPrivateKeyboard(
        actorTelegramUserId,
        this.context.texts.choosePlayModePrompt(),
        [
          [{ text: this.context.texts.playModeButton("ONLINE"), data: `cfg:play:ONLINE:${gameId}` }],
          [{ text: this.context.texts.playModeButton("OFFLINE"), data: `cfg:play:OFFLINE:${gameId}` }],
        ],
      );
      if (!sentPrompt) {
        const sentFallback = await this.context.notifier.sendGroupMessage(
          game.chatId,
          this.context.texts.creatorDmRequired(this.context.notifier.buildBotDeepLink()),
        );
        if (sentFallback instanceof Error) return sentFallback;
      }
      return;
    }

    if (draft.mode === "NORMAL" && !draft.pairingMode) {
      const sentPrompt = await this.context.notifier.sendPrivateKeyboard(
        actorTelegramUserId,
        this.context.texts.choosePairingModePrompt(),
        [
          [{ text: this.context.texts.pairingModeButton("RANDOM"), data: `cfg:pair:RANDOM:${gameId}` }],
          [{ text: this.context.texts.pairingModeButton("MANUAL"), data: `cfg:pair:MANUAL:${gameId}` }],
        ],
      );
      if (!sentPrompt) {
        const sentFallback = await this.context.notifier.sendGroupMessage(
          game.chatId,
          this.context.texts.creatorDmRequired(this.context.notifier.buildBotDeepLink()),
        );
        if (sentFallback instanceof Error) return sentFallback;
      }
      return;
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

      const updated = this.context.engine.configureGame(current, updateInput, this.context.clock.nowIso());
      if (updated instanceof Error) return updated;

      this.context.repository.update(updated);
      return updated;
    });
    if (configured instanceof Error) return configured;

    this.configDraftStore.delete(gameId);

    const sentConfig = await this.context.notifier.sendGroupMessage(
      configured.chatId,
      this.context.texts.configSaved({
        mode: configured.config!.mode,
        playMode: configured.config!.playMode,
        pairingMode: configured.config!.pairingMode,
      }),
    );
    if (sentConfig instanceof Error) return sentConfig;

    if (configured.config?.mode === "NORMAL" && configured.config.pairingMode === "MANUAL" && Object.keys(configured.words).length === 0) {
      return this.normalPairingStage.promptCurrentChooser(configured);
    }

    return this.wordPreparationStage.promptWordCollection(configured);
  }
}
