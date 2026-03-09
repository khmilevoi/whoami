import { GameServiceContext } from "../../src/application/game-service-context";
import { NormalModeService } from "../../src/application/modes/normal-mode-service";
import { ReverseModeService } from "../../src/application/modes/reverse-mode-service";
import { ConfigurationStageService } from "../../src/application/stages/configuration-stage-service";
import { NormalPairingStageService } from "../../src/application/stages/normal-pairing-stage-service";
import { ReadyStartStageService } from "../../src/application/stages/ready-start-stage-service";
import { WordPreparationStageService } from "../../src/application/stages/word-preparation-stage-service";
import { ConfigDraftStore } from "../../src/application/stores/config-draft-store";
import { PrivateExpectationStore } from "../../src/application/stores/private-expectation-store";
import { createGameServiceHarness, GameServiceHarness } from "./game-service.harness";

export interface GameServiceComponentHarness {
  readonly game: GameServiceHarness;
  readonly context: GameServiceContext;
  readonly normalMode: NormalModeService;
  readonly reverseMode: ReverseModeService;
  readonly readyStartStage: ReadyStartStageService;
  readonly wordPreparationStage: WordPreparationStageService;
  readonly normalPairingStage: NormalPairingStageService;
  readonly configurationStage: ConfigurationStageService;
  readonly configDraftStore: ConfigDraftStore;
  readonly expectationStore: PrivateExpectationStore;
}

export const createGameServiceComponentHarness = (): GameServiceComponentHarness => {
  const game = createGameServiceHarness();
  const context = new GameServiceContext({
    engine: game.engine,
    repository: game.repository,
    transactionRunner: game.transactionRunner,
    notifier: game.notifier,
    identity: game.identity,
    idPort: game.idPort,
    clock: game.clock,
    logger: game.logger,
    limits: game.limits,
  });

  const configDraftStore = new ConfigDraftStore();
  const expectationStore = new PrivateExpectationStore();
  const normalMode = new NormalModeService(context);
  const reverseMode = new ReverseModeService(context);
  const readyStartStage = new ReadyStartStageService(context, [normalMode, reverseMode]);
  const wordPreparationStage = new WordPreparationStageService(context, expectationStore, readyStartStage);
  const normalPairingStage = new NormalPairingStageService(context, wordPreparationStage);
  const configurationStage = new ConfigurationStageService(context, configDraftStore, normalPairingStage, wordPreparationStage);

  return {
    game,
    context,
    normalMode,
    reverseMode,
    readyStartStage,
    wordPreparationStage,
    normalPairingStage,
    configurationStage,
    configDraftStore,
    expectationStore,
  };
};
