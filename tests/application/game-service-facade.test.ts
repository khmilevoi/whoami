import { describe, expect, it, vi } from "vitest";
import { createGameServiceHarness } from "./game-service.harness";

describe("game service facade", () => {
  it("delegates stage-specific methods to extracted stage services", async () => {
    const harness = createGameServiceHarness();
    const service = harness.service as any;

    const configurationStage = { applyConfigStep: vi.fn().mockResolvedValue(undefined) };
    const normalPairingStage = { applyManualPair: vi.fn().mockResolvedValue(undefined) };
    const wordPreparationStage = {
      handlePrivateText: vi.fn().mockResolvedValue(undefined),
      handleWordCallback: vi.fn().mockResolvedValue(undefined),
    };

    service.configurationStage = configurationStage;
    service.normalPairingStage = normalPairingStage;
    service.wordPreparationStage = wordPreparationStage;

    await harness.service.applyConfigStep("game-1", "user-1", "mode", "NORMAL");
    await harness.service.applyManualPair("game-1", "user-1", "target-1");
    await harness.service.handlePrivateText("user-1", "hello");
    await harness.service.handleWordCallback("game-1", "user-1", "confirm", "YES");

    expect(configurationStage.applyConfigStep).toHaveBeenCalledWith("game-1", "user-1", "mode", "NORMAL");
    expect(normalPairingStage.applyManualPair).toHaveBeenCalledWith("game-1", "user-1", "target-1");
    expect(wordPreparationStage.handlePrivateText).toHaveBeenCalledWith("user-1", "hello");
    expect(wordPreparationStage.handleWordCallback).toHaveBeenCalledWith("game-1", "user-1", "confirm", "YES");
  });

  it("routes gameplay methods by configured mode", async () => {
    const harness = createGameServiceHarness();
    const chatId = "chat-facade-routing";
    const actors = [harness.createActor(1), harness.createActor(2), harness.createActor(3)];
    const started = await harness.setupNormalOnlineRandomInProgress(chatId, actors);

    const normalModeService = {
      mode: "NORMAL",
      handleGroupText: vi.fn().mockResolvedValue(undefined),
      askOffline: vi.fn().mockResolvedValue(undefined),
      handleVote: vi.fn().mockResolvedValue(undefined),
      giveUp: vi.fn().mockResolvedValue(undefined),
      announceCurrentTurn: vi.fn().mockResolvedValue(undefined),
      beforeFirstTurn: vi.fn().mockResolvedValue(undefined),
      sendFinalSummary: vi.fn().mockResolvedValue(undefined),
    };

    (harness.service as any).modeServices = new Map([["NORMAL", normalModeService]]);

    await harness.service.handleGroupText(chatId, actors[0].telegramUserId, "question");
    await harness.service.askOffline(chatId, actors[0].telegramUserId);
    await harness.service.handleVote(started.id, actors[0].telegramUserId, "NO");
    await harness.service.giveUp(chatId, actors[0].telegramUserId);

    expect(normalModeService.handleGroupText).toHaveBeenCalledWith(chatId, actors[0].telegramUserId, "question");
    expect(normalModeService.askOffline).toHaveBeenCalledWith(chatId, actors[0].telegramUserId);
    expect(normalModeService.handleVote).toHaveBeenCalledWith(started.id, actors[0].telegramUserId, "NO");
    expect(normalModeService.giveUp).toHaveBeenCalledWith(chatId, actors[0].telegramUserId);
  });
});
