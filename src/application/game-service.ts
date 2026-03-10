import * as appErrors from "../domain/errors";
import { GameEngine } from "../domain/game-engine";
import { GameMode, VoteDecision } from "../domain/types";
import type { GameServiceError, RecoveryStartupError } from "./errors";
import {
  ClockPort,
  GameRepository,
  IdPort,
  IdentityPort,
  LoggerPort,
  NotifierPort,
  TransactionRunner,
} from "./ports";
import { GameServiceContext } from "./game-service-context";
import { GameModeService } from "./modes/game-mode-service";
import { NormalModeService } from "./modes/normal-mode-service";
import { ReverseModeService } from "./modes/reverse-mode-service";
import { ConfigurationStageService } from "./stages/configuration-stage-service";
import { NormalPairingStageService } from "./stages/normal-pairing-stage-service";
import { ReadyStartStageService } from "./stages/ready-start-stage-service";
import { WordPreparationStageService } from "./stages/word-preparation-stage-service";
import { ConfigDraftStore } from "./stores/config-draft-store";
import { PrivateExpectationStore } from "./stores/private-expectation-store";
import { TextService } from "./text-service";

interface ActorInput {
  telegramUserId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
}

export class GameService {
  private readonly context: GameServiceContext;
  private readonly configurationStage: ConfigurationStageService;
  private readonly normalPairingStage: NormalPairingStageService;
  private readonly wordPreparationStage: WordPreparationStageService;
  private readonly modeServices: Map<GameMode, GameModeService>;

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
    });

    const configDraftStore = new ConfigDraftStore();
    const expectationStore = new PrivateExpectationStore();
    const normalModeService = new NormalModeService(this.context);
    const reverseModeService = new ReverseModeService(this.context);

    this.modeServices = new Map<GameMode, GameModeService>([
      [normalModeService.mode, normalModeService],
      [reverseModeService.mode, reverseModeService],
    ]);

    const readyStartStage = new ReadyStartStageService(this.context, [
      ...this.modeServices.values(),
    ]);
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
    const player = this.identity.toPlayerIdentity({
      telegramUserId: actor.telegramUserId,
      username: actor.username,
      firstName: actor.firstName,
      lastName: actor.lastName,
    });

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

    const sentStart = await this.notifier.sendGroupMessage(
      chatId,
      this.texts.gameStarted(player.displayName),
    );
    if (sentStart instanceof Error) return sentStart;
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
    const player = this.identity.toPlayerIdentity({
      telegramUserId: actor.telegramUserId,
      username: actor.username,
      firstName: actor.firstName,
      lastName: actor.lastName,
    });

    const game = this.transactionRunner.runInTransaction(() => {
      const current = this.context.getGameByChatOrError(chatId);
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

    const sentJoin = await this.notifier.sendGroupMessage(
      chatId,
      this.texts.playerJoined(player.displayName, game.players.length),
    );
    if (sentJoin instanceof Error) return sentJoin;
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

    const creator = game.players.find(
      (player) => player.id === game.creatorPlayerId,
    );
    if (!creator) {
      return;
    }

    const sentConfiguring = await this.notifier.sendGroupMessage(
      chatId,
      this.texts.lobbyClosedConfiguringInPrivate(),
    );
    if (sentConfiguring instanceof Error) return sentConfiguring;

    const ok = await this.notifier.sendPrivateKeyboard(
      creator.telegramUserId,
      this.texts.chooseGameModePrompt(),
      [
        [
          {
            text: this.texts.gameModeButton("NORMAL"),
            data: `cfg:mode:NORMAL:${game.id}`,
          },
        ],
        [
          {
            text: this.texts.gameModeButton("REVERSE"),
            data: `cfg:mode:REVERSE:${game.id}`,
          },
        ],
      ],
    );

    if (!ok) {
      const updated = this.transactionRunner.runInTransaction(() => {
        const current = this.context.getGameByIdOrError(game.id);
        if (current instanceof Error) return current;

        const next = this.engine.markDmBlocked(
          current,
          creator.id,
          this.clock.nowIso(),
        );
        if (next instanceof Error) return next;

        this.repository.update(next);
        return next;
      });
      if (updated instanceof Error) return updated;

      const sentFallback = await this.notifier.sendGroupMessage(
        chatId,
        this.texts.creatorDmRequired(this.notifier.buildBotDeepLink()),
      );
      if (sentFallback instanceof Error) return sentFallback;
    }
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
    telegramUserId: string,
  ): Promise<void | GameServiceError> {
    const games = this.repository.listActiveGames();
    const matched = games.filter((game) =>
      game.players.some((player) => player.telegramUserId === telegramUserId),
    );

    for (const game of matched) {
      const updated = this.transactionRunner.runInTransaction(() => {
        const current = this.context.getGameByIdOrError(game.id);
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
    }

    if (matched.length === 0) {
      await this.notifier.sendPrivateMessage(
        telegramUserId,
        this.texts.noActiveGamesForUser(),
      );
      return;
    }

    await this.notifier.sendPrivateMessage(
      telegramUserId,
      this.texts.privateChatActivated(),
    );
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

    const sentCancel = await this.notifier.sendGroupMessage(
      updated.chatId,
      this.texts.gameCancelledByCreator(),
    );
    if (sentCancel instanceof Error) return sentCancel;
  }

  private getModeService(
    mode: GameMode,
  ): GameModeService | appErrors.UnknownGameModeError {
    const service = this.modeServices.get(mode);
    if (!service) {
      return new appErrors.UnknownGameModeError({ mode });
    }
    return service;
  }
}
