import * as appErrors from "../domain/errors.js";
import { GameEngine } from "../domain/game-engine.js";
import { LocaleSource, GameMode, GameState, PlayerIdentity, SupportedLocale, VoteDecision } from "../domain/types.js";
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
  languageCode?: string;
}

type ActorLike = ActorInput | string;

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
    actor: ActorLike,
  ): Promise<void | GameServiceError> {
    const actorInput = this.toActorInput(actor);
    const player = this.persistActorProfile(actorInput);
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
    actor: ActorLike,
  ): Promise<void | GameServiceError> {
    const game = this.repository.findActiveByChatId(chatId);
    if (!game) {
      return new appErrors.ActiveGameNotFoundByChatError();
    }

    return this.joinGameById(game.id, actor);
  }

  async joinGameById(
    gameId: string,
    actor: ActorLike,
  ): Promise<void | GameServiceError> {
    const actorInput = this.toActorInput(actor);
    const player = this.persistActorProfile(actorInput);

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
    actor: ActorLike,
  ): Promise<void | GameServiceError> {
    const actorInput = this.toActorInput(actor);
    const actorIdentity = this.persistActorProfile(actorInput);
    const now = this.clock.nowIso();

    const game = this.transactionRunner.runInTransaction(() => {
      const current = this.context.getGameByChatOrError(chatId);
      if (current instanceof Error) return current;

      this.syncActorOnGameState(current, actorIdentity);
      const actorPlayer = this.context.getPlayerByTelegramOrError(
        current,
        actorIdentity.telegramUserId,
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
    actor: ActorLike,
  ): Promise<void | GameServiceError> {
    const game = this.context.getGameByIdOrError(gameId);
    if (game instanceof Error) return game;

    return this.beginConfiguration(game.chatId, actor);
  }

  async applyConfigStep(
    gameId: string,
    actor: ActorLike,
    key: "mode" | "play" | "pair",
    value: string,
  ): Promise<void | GameServiceError> {
    const actorInput = this.toActorInput(actor);
    const actorIdentity = this.persistActorProfile(actorInput);
    const refreshResult = this.refreshActorInGame(gameId, actorIdentity);
    if (refreshResult instanceof Error) return refreshResult;
    return this.configurationStage.applyConfigStep(
      gameId,
      actorIdentity.telegramUserId,
      key,
      value,
    );
  }

  async applyManualPair(
    gameId: string,
    chooser: ActorLike,
    targetPlayerId: string,
  ): Promise<void | GameServiceError> {
    const actorInput = this.toActorInput(chooser);
    const actorIdentity = this.persistActorProfile(actorInput);
    const refreshResult = this.refreshActorInGame(gameId, actorIdentity);
    if (refreshResult instanceof Error) return refreshResult;
    return this.normalPairingStage.applyManualPair(
      gameId,
      actorIdentity.telegramUserId,
      targetPlayerId,
    );
  }

  async handlePrivateText(
    actor: ActorLike,
    text: string,
  ): Promise<void | GameServiceError> {
    const actorInput = this.toActorInput(actor);
    const actorIdentity = this.persistActorProfile(actorInput);
    const refreshResult = this.refreshActorAcrossActiveGames(actorIdentity);
    if (refreshResult instanceof Error) return refreshResult;
    return this.wordPreparationStage.handlePrivateText(actorIdentity.telegramUserId, text);
  }

  async handleWordCallback(
    gameId: string,
    actor: ActorLike,
    action: "confirm" | "clue" | "final",
    value: "YES" | "NO",
  ): Promise<void | GameServiceError> {
    const actorInput = this.toActorInput(actor);
    const actorIdentity = this.persistActorProfile(actorInput);
    const refreshResult = this.refreshActorInGame(gameId, actorIdentity);
    if (refreshResult instanceof Error) return refreshResult;
    return this.wordPreparationStage.handleWordCallback(
      gameId,
      actorIdentity.telegramUserId,
      action,
      value,
    );
  }

  async handlePrivateStart(
    actor: ActorLike,
    payload?: StartPayloadInput | null,
  ): Promise<void | GameServiceError> {
    const actorInput = this.toActorInput(actor);
    const actorIdentity = this.persistActorProfile(actorInput);
    if (payload?.action === "join") {
      const joinResult = await this.joinGameById(payload.gameId, actorInput);
      if (joinResult instanceof Error) return joinResult;

      return this.markPrivateOpened(payload.gameId, actorIdentity);
    }

    if (payload?.action === "open") {
      return this.markPrivateOpened(payload.gameId, actorIdentity);
    }

    const chatIds = this.statusService.listActiveChatIdsByTelegramUser(
      actorIdentity.telegramUserId,
    );

    for (const chatId of chatIds) {
      const game = this.repository.findActiveByChatId(chatId);
      if (!game) {
        continue;
      }

      const markResult = this.markPrivateOpened(game.id, actorIdentity);
      if (markResult instanceof Error) return markResult;
    }

    if (chatIds.length === 0) {
      await this.notifier.sendPrivateMessage(
        actorIdentity.telegramUserId,
        this.texts.forLocale(actorIdentity.locale ?? this.texts.locale).noActiveGamesForUser(),
      );
      return;
    }
  }

  async recoverManualPairingPromptsOnStartup(): Promise<void | RecoveryStartupError> {
    return this.normalPairingStage.recoverPromptsOnStartup();
  }

  async handleGroupText(
    chatId: string,
    actor: ActorLike,
    text: string,
  ): Promise<void | GameServiceError> {
    const actorInput = this.toActorInput(actor);
    const actorIdentity = this.persistActorProfile(actorInput);
    const refreshResult = this.refreshActorByChatId(chatId, actorIdentity);
    if (refreshResult instanceof Error) return refreshResult;

    const game = this.repository.findActiveByChatId(chatId);
    if (!game?.config?.mode) {
      return;
    }

    const modeService = this.getModeService(game.config.mode);
    if (modeService instanceof Error) return modeService;
    return modeService.handleGroupText(chatId, actorIdentity.telegramUserId, text);
  }

  async askOffline(
    chatId: string,
    actor: ActorLike,
  ): Promise<void | GameServiceError> {
    const actorInput = this.toActorInput(actor);
    const actorIdentity = this.persistActorProfile(actorInput);
    const refreshResult = this.refreshActorByChatId(chatId, actorIdentity);
    if (refreshResult instanceof Error) return refreshResult;

    const game = this.repository.findActiveByChatId(chatId);
    if (!game?.config?.mode) {
      return;
    }

    const modeService = this.getModeService(game.config.mode);
    if (modeService instanceof Error) return modeService;
    return modeService.askOffline(chatId, actorIdentity.telegramUserId);
  }

  async handleVote(
    gameId: string,
    actor: ActorLike,
    decision: VoteDecision,
  ): Promise<void | GameServiceError> {
    const actorInput = this.toActorInput(actor);
    const actorIdentity = this.persistActorProfile(actorInput);
    const refreshResult = this.refreshActorInGame(gameId, actorIdentity);
    if (refreshResult instanceof Error) return refreshResult;

    const game = this.context.getGameByIdOrError(gameId);
    if (game instanceof Error) return game;

    if (!game.config?.mode) {
      return new appErrors.GameConfigurationNotSetError();
    }

    const modeService = this.getModeService(game.config.mode);
    if (modeService instanceof Error) return modeService;
    return modeService.handleVote(gameId, actorIdentity.telegramUserId, decision);
  }

  async giveUp(
    chatId: string,
    actor: ActorLike,
  ): Promise<void | GameServiceError> {
    const actorInput = this.toActorInput(actor);
    const actorIdentity = this.persistActorProfile(actorInput);
    const refreshResult = this.refreshActorByChatId(chatId, actorIdentity);
    if (refreshResult instanceof Error) return refreshResult;

    const game = this.repository.findActiveByChatId(chatId);
    if (!game) {
      return;
    }

    if (game.stage !== "IN_PROGRESS") {
      const sentMessage = await this.notifier.sendGroupMessage(
        chatId,
        this.context.textsForGame(game).giveUpOnlyDuringGame(),
      );
      if (sentMessage instanceof Error) return sentMessage;
      return;
    }

    if (!game.config?.mode) {
      return;
    }

    const modeService = this.getModeService(game.config.mode);
    if (modeService instanceof Error) return modeService;
    return modeService.giveUp(chatId, actorIdentity.telegramUserId);
  }

  async cancel(
    chatId: string,
    actor: ActorLike,
  ): Promise<void | GameServiceError> {
    const actorInput = this.toActorInput(actor);
    const actorIdentity = this.persistActorProfile(actorInput);
    const game = this.repository.findActiveByChatId(chatId);
    if (!game) {
      return;
    }

    const actorRefreshResult = this.refreshActorByChatId(chatId, actorIdentity);
    if (actorRefreshResult instanceof Error) return actorRefreshResult;

    const latestGame = this.repository.findActiveByChatId(chatId) ?? game;
    const actorPlayer = this.context.getPlayerByTelegramOrError(latestGame, actorIdentity.telegramUserId);
    if (actorPlayer instanceof Error) return actorPlayer;

    if (actorPlayer.id !== latestGame.creatorPlayerId) {
      return new appErrors.OnlyGameCreatorCanCancelError();
    }

    const updated = this.transactionRunner.runInTransaction(() => {
      const current = this.context.getGameByIdOrError(latestGame.id);
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

  async setUserLocalePreference(
    actor: ActorLike,
    locale: SupportedLocale,
  ): Promise<void | GameServiceError> {
    const actorInput = this.toActorInput(actor);
    const actorIdentity = this.persistActorProfile(actorInput, {
      locale,
      localeSource: "explicit",
    });
    const refreshResult = this.refreshActorAcrossActiveGames(actorIdentity);
    if (refreshResult instanceof Error) {
      return refreshResult;
    }
  }

  findConfiguringGameByCreator(
    telegramUserId: string,
  ): GameStatusSnapshot | null {
    return this.statusService.findConfiguringGameByCreator(telegramUserId);
  }

  private markPrivateOpened(
    gameId: string,
    actorIdentity: PlayerIdentity,
  ): GameServiceError | void {
    const updated = this.transactionRunner.runInTransaction(() => {
      const current = this.context.getGameByIdOrError(gameId);
      if (current instanceof Error) return current;

      this.syncActorOnGameState(current, actorIdentity);
      const player = this.context.getPlayerByTelegramOrError(
        current,
        actorIdentity.telegramUserId,
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

  private persistActorProfile(
    actor: ActorLike,
    override?: { locale: SupportedLocale; localeSource: LocaleSource },
  ): PlayerIdentity {
    const actorInput = this.toActorInput(actor);
    const actorIdentity = this.resolveActorIdentity(actorInput, override);
    const existing = this.repository.findPlayerProfileByTelegramUserId(actorInput.telegramUserId);
    this.repository.upsertPlayerProfile({
      id: actorIdentity.id,
      telegramUserId: actorIdentity.telegramUserId,
      username: actorIdentity.username,
      displayName: actorIdentity.displayName,
      locale: actorIdentity.locale ?? this.texts.locale,
      localeSource: actorIdentity.localeSource ?? "telegram",
      createdAt: existing?.createdAt ?? this.clock.nowIso(),
    });
    return actorIdentity;
  }

  private resolveActorIdentity(
    actor: ActorInput,
    override?: { locale: SupportedLocale; localeSource: LocaleSource },
  ): PlayerIdentity {
    const existing = this.repository.findPlayerProfileByTelegramUserId(actor.telegramUserId);
    if (override) {
      return this.identity.toPlayerIdentity({
        ...actor,
        locale: override.locale,
        localeSource: override.localeSource,
      });
    }

    if (existing?.localeSource === "explicit") {
      return this.identity.toPlayerIdentity({
        ...actor,
        locale: existing.locale,
        localeSource: "explicit",
      });
    }

    return this.identity.toPlayerIdentity(actor);
  }

  private refreshActorAcrossActiveGames(actorIdentity: PlayerIdentity): void | GameServiceError {
    for (const chatId of this.statusService.listActiveChatIdsByTelegramUser(actorIdentity.telegramUserId)) {
      const result = this.refreshActorByChatId(chatId, actorIdentity);
      if (result instanceof Error) {
        return result;
      }
    }
  }

  private refreshActorByChatId(
    chatId: string,
    actorIdentity: PlayerIdentity,
  ): void | GameServiceError {
    const game = this.repository.findActiveByChatId(chatId);
    if (!game) {
      return;
    }

    return this.refreshActorInGame(game.id, actorIdentity);
  }

  private refreshActorInGame(
    gameId: string,
    actorIdentity: PlayerIdentity,
  ): void | GameServiceError {
    const updated = this.transactionRunner.runInTransaction(() => {
      const current = this.context.getGameByIdOrError(gameId);
      if (current instanceof Error) return current;

      const changed = this.syncActorOnGameState(current, actorIdentity);
      if (!changed) {
        return null;
      }

      this.repository.update(current);
      return current;
    });
    if (updated instanceof Error) return updated;
    if (!updated) {
      return;
    }

    this.statusService.publish(updated);
  }

  private syncActorOnGameState(
    game: GameState,
    actorIdentity: PlayerIdentity,
  ): boolean {
    const player = game.players.find(
      (candidate) => candidate.telegramUserId === actorIdentity.telegramUserId,
    );
    if (!player) {
      return false;
    }

    const nextLocale = actorIdentity.locale ?? player.locale ?? this.texts.locale;
    const nextLocaleSource = actorIdentity.localeSource ?? player.localeSource ?? "telegram";
    const shouldUpdateLocale =
      player.localeSource !== "explicit" || nextLocaleSource === "explicit";

    const changed =
      player.username !== actorIdentity.username ||
      player.displayName !== actorIdentity.displayName ||
      (shouldUpdateLocale &&
        (player.locale !== nextLocale || player.localeSource !== nextLocaleSource));

    if (!changed) {
      return false;
    }

    player.username = actorIdentity.username;
    player.displayName = actorIdentity.displayName;
    if (shouldUpdateLocale) {
      player.locale = nextLocale;
      player.localeSource = nextLocaleSource;
    }
    game.updatedAt = this.clock.nowIso();
    return true;
  }

  private toActorInput(actor: ActorLike): ActorInput {
    if (typeof actor === "string") {
      return { telegramUserId: actor };
    }

    return actor;
  }
}
