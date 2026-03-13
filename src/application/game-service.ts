import * as appErrors from "../domain/errors.js";
import { GameEngine } from "../domain/game-engine.js";
import { GameMode, VoteDecision } from "../domain/types.js";
import type { GameServiceError, RecoveryStartupError } from "./errors.js";
import { GameServiceContext } from "./game-service-context.js";
import { GameStatusService, GameStatusSnapshot } from "./game-status-service.js";
import { NormalModeService } from "./modes/normal-mode-service.js";
import { ReverseModeService } from "./modes/reverse-mode-service.js";
import {
  ClockPort,
  GameRepository,
  IdPort,
  IdentityPort,
  LoggerPort,
  NotifierPort,
  TransactionRunner,
} from "./ports.js";
import { ConfigurationStageService } from "./stages/configuration-stage-service.js";
import { NormalPairingStageService } from "./stages/normal-pairing-stage-service.js";
import { ReadyStartStageService } from "./stages/ready-start-stage-service.js";
import { WordPreparationStageService } from "./stages/word-preparation-stage-service.js";
import { ConfigDraftStore } from "./stores/config-draft-store.js";
import { PrivateExpectationStore } from "./stores/private-expectation-store.js";
import { TextService } from "./text-service.js";

interface ActorInput {
  telegramUserId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
}

interface StartPayloadInput {
  action: "join" | "open";
  gameId: string;
}

export class GameService {
  private readonly context: GameServiceContext;
  private readonly configurationStage: ConfigurationStageService;
  private readonly normalPairingStage: NormalPairingStageService;
  private readonly wordPreparationStage: WordPreparationStageService;
  private readonly modeServices: Map<GameMode, NormalModeService | ReverseModeService>;

  constructor(
    private readonly engine: GameEngine,
    private readonly repository: GameRepository,
    private readonly transactionRunner: TransactionRunner,
    private readonly notifier: NotifierPort,
    private readonly identity: IdentityPort,
    private readonly idPort: IdPort,
    private readonly clock: ClockPort,
    private readonly logger: LoggerPort,
    private readonly texts: TextService,
    private readonly limits: { minPlayers: number; maxPlayers: number },
    private readonly statusService: GameStatusService,
    configDraftStore = new ConfigDraftStore(),
    expectationStore = new PrivateExpectationStore(),
  ) {
    this.context = new GameServiceContext({
      engine,
      repository,
      transactionRunner,
      notifier,
      identity,
      idPort,
      clock,
      logger,
      texts,
      limits,
      statusService,
    });

    const normalModeService = new NormalModeService(this.context);
    const reverseModeService = new ReverseModeService(this.context);

    this.modeServices = new Map<GameMode, NormalModeService | ReverseModeService>([
      [normalModeService.mode, normalModeService],
      [reverseModeService.mode, reverseModeService],
    ]);

    const readyStartStage = new ReadyStartStageService(this.context);
    this.wordPreparationStage = new WordPreparationStageService(
      this.context,
      expectationStore,
      readyStartStage,
    );
    this.normalPairingStage = new NormalPairingStageService(
      this.context,
      this.wordPreparationStage,
    );
    this.configurationStage = new ConfigurationStageService(
      this.context,
      configDraftStore,
      this.normalPairingStage,
      this.wordPreparationStage,
    );
  }

  async startGame(
    chatId: string,
    actor: ActorInput,
  ): Promise<void | GameServiceError> {
    const player = this.identity.toPlayerIdentity(actor);
    const now = this.clock.nowIso();

    const game = this.transactionRunner.runInTransaction(() => {
      const existing = this.repository.findActiveByChatId(chatId);
      if (existing) {
        return new appErrors.ActiveGameAlreadyExistsInChatError();
      }

      const next = this.engine.createGame({
        gameId: this.idPort.nextId(),
        chatId,
        creator: player,
        now,
      });

      this.repository.create(next);
      return next;
    });
    if (game instanceof Error) return game;

    this.statusService.publish(game);

    this.logger.info("game_started", {
      gameId: game.id,
      chatId,
      creator: player.id,
    });
  }

  async joinGame(
    chatId: string,
    actor: ActorInput,
  ): Promise<void | GameServiceError> {
    const game = this.repository.findActiveByChatId(chatId);
    if (!game) {
      return new appErrors.ActiveGameNotFoundByChatError();
    }

    return this.joinGameById(game.id, actor);
  }

  async joinGameById(
    gameId: string,
    actor: ActorInput,
  ): Promise<void | GameServiceError> {
    const player = this.identity.toPlayerIdentity(actor);

    const game = this.transactionRunner.runInTransaction(() => {
      const current = this.context.getGameByIdOrError(gameId);
      if (current instanceof Error) return current;

      const updated = this.engine.joinGame(
        current,
        player,
        this.limits,
        this.clock.nowIso(),
      );
      if (updated instanceof Error) return updated;

      this.repository.update(updated);
      return updated;
    });
    if (game instanceof Error) return game;

    return this.statusService.publish(game);
  }

  async beginConfiguration(
    chatId: string,
    actorTelegramUserId: string,
  ): Promise<void | GameServiceError> {
    const now = this.clock.nowIso();

    const game = this.transactionRunner.runInTransaction(() => {
      const current = this.context.getGameByChatOrError(chatId);
      if (current instanceof Error) return current;

      const actorPlayer = this.context.getPlayerByTelegramOrError(
        current,
        actorTelegramUserId,
      );
      if (actorPlayer instanceof Error) return actorPlayer;

      const updated = this.engine.closeLobby(
        current,
        actorPlayer.id,
        this.limits,
        now,
      );
      if (updated instanceof Error) return updated;

      this.repository.update(updated);
      return updated;
    });
    if (game instanceof Error) return game;

    return this.statusService.publish(game);
  }

  async beginConfigurationByGameId(
    gameId: string,
    actorTelegramUserId: string,
  ): Promise<void | GameServiceError> {
    const game = this.context.getGameByIdOrError(gameId);
    if (game instanceof Error) return game;

    return this.beginConfiguration(game.chatId, actorTelegramUserId);
  }

  async applyConfigStep(
    gameId: string,
    actorTelegramUserId: string,
    key: "mode" | "play" | "pair",
    value: string,
  ): Promise<void | GameServiceError> {
    return this.configurationStage.applyConfigStep(
      gameId,
      actorTelegramUserId,
      key,
      value,
    );
  }

  async applyManualPair(
    gameId: string,
    chooserTelegramUserId: string,
    targetPlayerId: string,
  ): Promise<void | GameServiceError> {
    return this.normalPairingStage.applyManualPair(
      gameId,
      chooserTelegramUserId,
      targetPlayerId,
    );
  }

  async handlePrivateText(
    telegramUserId: string,
    text: string,
  ): Promise<void | GameServiceError> {
    return this.wordPreparationStage.handlePrivateText(telegramUserId, text);
  }

  async handleWordCallback(
    gameId: string,
    telegramUserId: string,
    action: "confirm" | "clue" | "final",
    value: "YES" | "NO",
  ): Promise<void | GameServiceError> {
    return this.wordPreparationStage.handleWordCallback(
      gameId,
      telegramUserId,
      action,
      value,
    );
  }

  async handlePrivateStart(
    actor: ActorInput,
    payload?: StartPayloadInput | null,
  ): Promise<void | GameServiceError> {
    if (payload?.action === "join") {
      const joinResult = await this.joinGameById(payload.gameId, actor);
      if (joinResult instanceof Error) return joinResult;

      return this.markPrivateOpened(payload.gameId, actor.telegramUserId);
    }

    if (payload?.action === "open") {
      return this.markPrivateOpened(payload.gameId, actor.telegramUserId);
    }

    const chatIds = this.statusService.listActiveChatIdsByTelegramUser(
      actor.telegramUserId,
    );

    for (const chatId of chatIds) {
      const game = this.repository.findActiveByChatId(chatId);
      if (!game) {
        continue;
      }

      const markResult = this.markPrivateOpened(game.id, actor.telegramUserId);
      if (markResult instanceof Error) return markResult;
    }

    if (chatIds.length === 0) {
      await this.notifier.sendPrivateMessage(
        actor.telegramUserId,
        this.texts.noActiveGamesForUser(),
      );
      return;
    }
  }

  async recoverManualPairingPromptsOnStartup(): Promise<void | RecoveryStartupError> {
    return this.normalPairingStage.recoverPromptsOnStartup();
  }

  async handleGroupText(
    chatId: string,
    telegramUserId: string,
    text: string,
  ): Promise<void | GameServiceError> {
    const game = this.repository.findActiveByChatId(chatId);
    if (!game?.config?.mode) {
      return;
    }

    const modeService = this.getModeService(game.config.mode);
    if (modeService instanceof Error) return modeService;
    return modeService.handleGroupText(chatId, telegramUserId, text);
  }

  async askOffline(
    chatId: string,
    telegramUserId: string,
  ): Promise<void | GameServiceError> {
    const game = this.repository.findActiveByChatId(chatId);
    if (!game?.config?.mode) {
      return;
    }

    const modeService = this.getModeService(game.config.mode);
    if (modeService instanceof Error) return modeService;
    return modeService.askOffline(chatId, telegramUserId);
  }

  async handleVote(
    gameId: string,
    telegramUserId: string,
    decision: VoteDecision,
  ): Promise<void | GameServiceError> {
    const game = this.context.getGameByIdOrError(gameId);
    if (game instanceof Error) return game;

    if (!game.config?.mode) {
      return new appErrors.GameConfigurationNotSetError();
    }

    const modeService = this.getModeService(game.config.mode);
    if (modeService instanceof Error) return modeService;
    return modeService.handleVote(gameId, telegramUserId, decision);
  }

  async giveUp(
    chatId: string,
    telegramUserId: string,
  ): Promise<void | GameServiceError> {
    const game = this.repository.findActiveByChatId(chatId);
    if (!game) {
      return;
    }

    if (game.stage !== "IN_PROGRESS") {
      const sentMessage = await this.notifier.sendGroupMessage(
        chatId,
        this.texts.giveUpOnlyDuringGame(),
      );
      if (sentMessage instanceof Error) return sentMessage;
      return;
    }

    if (!game.config?.mode) {
      return;
    }

    const modeService = this.getModeService(game.config.mode);
    if (modeService instanceof Error) return modeService;
    return modeService.giveUp(chatId, telegramUserId);
  }

  async cancel(
    chatId: string,
    telegramUserId: string,
  ): Promise<void | GameServiceError> {
    const game = this.repository.findActiveByChatId(chatId);
    if (!game) {
      return;
    }

    const actor = this.context.getPlayerByTelegramOrError(game, telegramUserId);
    if (actor instanceof Error) return actor;

    if (actor.id !== game.creatorPlayerId) {
      return new appErrors.OnlyGameCreatorCanCancelError();
    }

    const updated = this.transactionRunner.runInTransaction(() => {
      const current = this.context.getGameByIdOrError(game.id);
      if (current instanceof Error) return current;

      const next = this.engine.cancelGame(
        current,
        "Canceled by creator",
        this.clock.nowIso(),
      );
      this.repository.update(next);
      return next;
    });
    if (updated instanceof Error) return updated;

    return this.statusService.publish(updated);
  }

  findConfiguringGameByCreator(
    telegramUserId: string,
  ): GameStatusSnapshot | null {
    return this.statusService.findConfiguringGameByCreator(telegramUserId);
  }

  private markPrivateOpened(
    gameId: string,
    telegramUserId: string,
  ): GameServiceError | void {
    const updated = this.transactionRunner.runInTransaction(() => {
      const current = this.context.getGameByIdOrError(gameId);
      if (current instanceof Error) return current;

      const player = this.context.getPlayerByTelegramOrError(
        current,
        telegramUserId,
      );
      if (player instanceof Error) return player;

      const next = this.engine.markDmOpened(
        current,
        player.id,
        this.clock.nowIso(),
      );
      if (next instanceof Error) return next;

      this.repository.update(next);
      return next;
    });

    if (updated instanceof Error) return updated;
    this.statusService.publish(updated);
  }

  private getModeService(
    mode: GameMode,
  ): NormalModeService | ReverseModeService | appErrors.UnknownGameModeError {
    const service = this.modeServices.get(mode);
    if (!service) {
      return new appErrors.UnknownGameModeError({ mode });
    }
    return service;
  }
}

