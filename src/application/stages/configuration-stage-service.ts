import { DomainError } from "../../domain/errors";
import { ConfigureGameInput, GameMode, PairingMode, PlayMode } from "../../domain/types";
import { gameModeLabel } from "../../domain/stats";
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

  async applyConfigStep(gameId: string, actorTelegramUserId: string, key: "mode" | "play" | "pair", value: string): Promise<void> {
    const game = this.context.requireGameById(gameId);
    const actor = this.context.requirePlayerByTelegram(game, actorTelegramUserId);

    if (actor.id !== game.creatorPlayerId) {
      throw new DomainError("Только создатель игры может настраивать режим");
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
      await this.context.notifier.sendPrivateKeyboard(
        actorTelegramUserId,
        "Выберите формат:",
        [[{ text: "Онлайн", data: `cfg:play:ONLINE:${gameId}` }], [{ text: "Оффлайн", data: `cfg:play:OFFLINE:${gameId}` }]],
      );
      return;
    }

    if (draft.mode === "NORMAL" && !draft.pairingMode) {
      await this.context.notifier.sendPrivateKeyboard(
        actorTelegramUserId,
        "Выберите распределение пар:",
        [[{ text: "Случайно", data: `cfg:pair:RANDOM:${gameId}` }], [{ text: "Ручной", data: `cfg:pair:MANUAL:${gameId}` }]],
      );
      return;
    }

    const configured = this.context.transactionRunner.runInTransaction(() => {
      const current = this.context.requireGameById(gameId);
      const updateInput: ConfigureGameInput = {
        actorPlayerId: actor.id,
        mode: draft.mode!,
        playMode: draft.playMode!,
        pairingMode: draft.mode === "NORMAL" ? draft.pairingMode : undefined,
      };

      const updated = this.context.engine.configureGame(current, updateInput, this.context.clock.nowIso());
      this.context.repository.update(updated);
      return updated;
    });

    this.configDraftStore.delete(gameId);

    await this.context.notifier.sendGroupMessage(
      configured.chatId,
      `Конфигурация сохранена: ${gameModeLabel(configured.config!.mode)}, ${
        configured.config!.playMode === "ONLINE" ? "онлайн" : "оффлайн"
      }${configured.config!.pairingMode ? `, пары: ${configured.config!.pairingMode === "RANDOM" ? "случайно" : "ручной"}` : ""}.`,
    );

    if (configured.config?.mode === "NORMAL" && configured.config.pairingMode === "MANUAL" && Object.keys(configured.words).length === 0) {
      await this.normalPairingStage.promptCurrentChooser(configured);
      return;
    }

    await this.wordPreparationStage.promptWordCollection(configured);
  }
}
