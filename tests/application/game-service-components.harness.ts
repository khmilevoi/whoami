import { GameServiceContext } from "../../src/application/game-service-context.js";
import { InMemoryGameStatusService } from "../../src/application/game-status-service.js";
import { NormalModeService } from "../../src/application/modes/normal-mode-service.js";
import { ReverseModeService } from "../../src/application/modes/reverse-mode-service.js";
import { PregameUiSyncService } from "../../src/application/pregame-ui-sync-service.js";
import { ConfigurationStageService } from "../../src/application/stages/configuration-stage-service.js";
import { NormalPairingStageService } from "../../src/application/stages/normal-pairing-stage-service.js";
import { ReadyStartStageService } from "../../src/application/stages/ready-start-stage-service.js";
import { WordPreparationStageService } from "../../src/application/stages/word-preparation-stage-service.js";
import { ConfigDraftStore } from "../../src/application/stores/config-draft-store.js";
import { PrivateExpectationStore } from "../../src/application/stores/private-expectation-store.js";
import {
  createGameServiceHarness,
  GameServiceHarness,
} from "./game-service.harness.js";

export interface GameServiceComponentHarness {
  readonly game: GameServiceHarness;
  readonly context: GameServiceContext;
  readonly normalMode: NormalModeService;
  readonly reverseMode: ReverseModeService;
  readonly pregameUiSync: PregameUiSyncService;
  readonly readyStartStage: ReadyStartStageService;
  readonly wordPreparationStage: WordPreparationStageService;
  readonly normalPairingStage: NormalPairingStageService;
  readonly configurationStage: ConfigurationStageService;
  readonly configDraftStore: ConfigDraftStore;
  readonly expectationStore: PrivateExpectationStore;
}

export const createGameServiceComponentHarness =
  (): GameServiceComponentHarness => {
    const game = createGameServiceHarness();
    const statusService = new InMemoryGameStatusService(game.repository, game.logger);
    const context = new GameServiceContext({
      engine: game.engine,
      repository: game.repository,
      transactionRunner: game.transactionRunner,
      notifier: game.notifier,
      identity: game.identity,
      idPort: game.idPort,
      clock: game.clock,
      logger: game.logger,
      texts: game.texts,
      limits: game.limits,
      statusService,
    });

    const configDraftStore = new ConfigDraftStore();
    const expectationStore = new PrivateExpectationStore();
    const pregameUiSync = new PregameUiSyncService(
      context,
      configDraftStore,
      expectationStore,
    );
    const normalMode = new NormalModeService(context);
    const reverseMode = new ReverseModeService(context);
    const readyStartStage = new ReadyStartStageService(context);
    const wordPreparationStage = new WordPreparationStageService(
      context,
      expectationStore,
      readyStartStage,
    );
    const normalPairingStage = new NormalPairingStageService(
      context,
      wordPreparationStage,
    );
    const configurationStage = new ConfigurationStageService(
      context,
      configDraftStore,
      normalPairingStage,
      wordPreparationStage,
    );

    return {
      game,
      context,
      normalMode,
      reverseMode,
      pregameUiSync,
      readyStartStage,
      wordPreparationStage,
      normalPairingStage,
      configurationStage,
      configDraftStore,
      expectationStore,
    };
  };
