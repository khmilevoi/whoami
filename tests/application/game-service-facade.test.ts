import { describe, expect, it, vi } from "vitest";
import type { GameModeService } from "../../src/application/modes/game-mode-service.js";
import type { ConfigurationStageService } from "../../src/application/stages/configuration-stage-service.js";
import type { NormalPairingStageService } from "../../src/application/stages/normal-pairing-stage-service.js";
import type { WordPreparationStageService } from "../../src/application/stages/word-preparation-stage-service.js";
import { createGameServiceHarness } from "./game-service.harness.js";
import { mustGetAt } from "../support/strict-helpers.js";

type FacadeInternals = {
  configurationStage: Pick<ConfigurationStageService, "applyConfigStep">;
  normalPairingStage: Pick<NormalPairingStageService, "applyManualPair">;
  wordPreparationStage: Pick<
    WordPreparationStageService,
    "handlePrivateText" | "handleWordCallback"
  >;
  modeServices: Map<"NORMAL", GameModeService>;
};

describe("game service facade", () => {
  it("delegates stage-specific methods to extracted stage services", async () => {
    const harness = createGameServiceHarness();
    const service = harness.service as unknown as FacadeInternals;

    const configurationStage = {
      applyConfigStep: vi.fn().mockResolvedValue(undefined),
    } satisfies Pick<ConfigurationStageService, "applyConfigStep">;
    const normalPairingStage = {
      applyManualPair: vi.fn().mockResolvedValue(undefined),
    } satisfies Pick<NormalPairingStageService, "applyManualPair">;
    const wordPreparationStage = {
      handlePrivateText: vi.fn().mockResolvedValue(undefined),
      handleWordCallback: vi.fn().mockResolvedValue(undefined),
    } satisfies Pick<
      WordPreparationStageService,
      "handlePrivateText" | "handleWordCallback"
    >;

    service.configurationStage = configurationStage;
    service.normalPairingStage = normalPairingStage;
    service.wordPreparationStage = wordPreparationStage;

    await harness.service.applyConfigStep("game-1", "user-1", "mode", "NORMAL");
    await harness.service.applyManualPair("game-1", "user-1", "target-1");
    await harness.service.handlePrivateText("user-1", "hello");
    await harness.service.handleWordCallback(
      "game-1",
      "user-1",
      "confirm",
      "YES",
    );

    expect(configurationStage.applyConfigStep).toHaveBeenCalledWith(
      "game-1",
      "user-1",
      "mode",
      "NORMAL",
    );
    expect(normalPairingStage.applyManualPair).toHaveBeenCalledWith(
      "game-1",
      "user-1",
      "target-1",
    );
    expect(wordPreparationStage.handlePrivateText).toHaveBeenCalledWith(
      "user-1",
      "hello",
    );
    expect(wordPreparationStage.handleWordCallback).toHaveBeenCalledWith(
      "game-1",
      "user-1",
      "confirm",
      "YES",
    );
  });

  it("routes gameplay methods by configured mode", async () => {
    const harness = createGameServiceHarness();
    const service = harness.service as unknown as FacadeInternals;
    const chatId = "chat-facade-routing";
    const actors = [
      harness.createActor(1),
      harness.createActor(2),
      harness.createActor(3),
    ];
    const firstActor = mustGetAt(actors, 0, "Expected first facade actor");
    const started = await harness.setupNormalOnlineRandomInProgress(
      chatId,
      actors,
    );

    const normalModeService = {
      mode: "NORMAL",
      handleGroupText: vi.fn().mockResolvedValue(undefined),
      askOffline: vi.fn().mockResolvedValue(undefined),
      handleVote: vi.fn().mockResolvedValue(undefined),
      giveUp: vi.fn().mockResolvedValue(undefined),
      announceCurrentTurn: vi.fn().mockResolvedValue(undefined),
      beforeFirstTurn: vi.fn().mockResolvedValue(undefined),
      sendFinalSummary: vi.fn().mockResolvedValue(undefined),
    } satisfies GameModeService;

    service.modeServices = new Map([["NORMAL", normalModeService]]);

    await harness.service.handleGroupText(
      chatId,
      firstActor.telegramUserId,
      "question",
    );
    await harness.service.askOffline(chatId, firstActor.telegramUserId);
    await harness.service.handleVote(
      started.id,
      firstActor.telegramUserId,
      "NO",
    );
    await harness.service.giveUp(chatId, firstActor.telegramUserId);

    expect(normalModeService.handleGroupText).toHaveBeenCalledWith(
      chatId,
      firstActor.telegramUserId,
      "question",
    );
    expect(normalModeService.askOffline).toHaveBeenCalledWith(
      chatId,
      firstActor.telegramUserId,
    );
    expect(normalModeService.handleVote).toHaveBeenCalledWith(
      started.id,
      firstActor.telegramUserId,
      "NO",
    );
    expect(normalModeService.giveUp).toHaveBeenCalledWith(
      chatId,
      firstActor.telegramUserId,
    );
  });
});
