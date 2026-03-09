import { GameEngine } from "../domain/game-engine";
import { DomainError } from "../domain/errors";
import { GameMode, VoteDecision } from "../domain/types";
import { ClockPort, GameRepository, IdPort, IdentityPort, LoggerPort, NotifierPort, TransactionRunner } from "./ports";
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

    const readyStartStage = new ReadyStartStageService(this.context, [...this.modeServices.values()]);
    this.wordPreparationStage = new WordPreparationStageService(this.context, expectationStore, readyStartStage);
    this.normalPairingStage = new NormalPairingStageService(this.context, this.wordPreparationStage);
    this.configurationStage = new ConfigurationStageService(
      this.context,
      configDraftStore,
      this.normalPairingStage,
      this.wordPreparationStage,
    );
  }

  async startGame(chatId: string, actor: ActorInput): Promise<void> {
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
        throw new DomainError({ code: "ACTIVE_GAME_ALREADY_EXISTS_IN_CHAT" });
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

    await this.notifier.sendGroupMessage(chatId, this.texts.gameStarted(player.displayName));

    this.logger.info("game_started", { gameId: game.id, chatId, creator: player.id });
  }

  async joinGame(chatId: string, actor: ActorInput): Promise<void> {
    const player = this.identity.toPlayerIdentity({
      telegramUserId: actor.telegramUserId,
      username: actor.username,
      firstName: actor.firstName,
      lastName: actor.lastName,
    });

    const game = this.transactionRunner.runInTransaction(() => {
      const current = this.context.requireGameByChat(chatId);
      const updated = this.engine.joinGame(current, player, this.limits, this.clock.nowIso());
      this.repository.update(updated);
      return updated;
    });

    await this.notifier.sendGroupMessage(chatId, this.texts.playerJoined(player.displayName, game.players.length));
  }

  async beginConfiguration(chatId: string, actorTelegramUserId: string): Promise<void> {
    const now = this.clock.nowIso();

    const game = this.transactionRunner.runInTransaction(() => {
      const current = this.context.requireGameByChat(chatId);
      const actorPlayer = this.context.requirePlayerByTelegram(current, actorTelegramUserId);
      const updated = this.engine.closeLobby(current, actorPlayer.id, this.limits, now);
      this.repository.update(updated);
      return updated;
    });

    const creator = game.players.find((player) => player.id === game.creatorPlayerId);
    if (!creator) {
      return;
    }

    await this.notifier.sendGroupMessage(chatId, this.texts.lobbyClosedConfiguringInPrivate());

    const ok = await this.notifier.sendPrivateKeyboard(
      creator.telegramUserId,
      this.texts.chooseGameModePrompt(),
      [
        [{ text: this.texts.gameModeButton("NORMAL"), data: `cfg:mode:NORMAL:${game.id}` }],
        [{ text: this.texts.gameModeButton("REVERSE"), data: `cfg:mode:REVERSE:${game.id}` }],
      ],
    );

    if (!ok) {
      this.transactionRunner.runInTransaction(() => {
        const current = this.context.requireGameById(game.id);
        this.engine.markDmBlocked(current, creator.id, this.clock.nowIso());
        this.repository.update(current);
      });

      await this.notifier.sendGroupMessage(chatId, this.texts.creatorDmRequired(this.notifier.buildBotDeepLink()));
    }
  }

  async applyConfigStep(gameId: string, actorTelegramUserId: string, key: "mode" | "play" | "pair", value: string): Promise<void> {
    await this.configurationStage.applyConfigStep(gameId, actorTelegramUserId, key, value);
  }

  async applyManualPair(gameId: string, chooserTelegramUserId: string, targetPlayerId: string): Promise<void> {
    await this.normalPairingStage.applyManualPair(gameId, chooserTelegramUserId, targetPlayerId);
  }

  async handlePrivateText(telegramUserId: string, text: string): Promise<void> {
    await this.wordPreparationStage.handlePrivateText(telegramUserId, text);
  }

  async handleWordCallback(
    gameId: string,
    telegramUserId: string,
    action: "confirm" | "clue" | "final",
    value: "YES" | "NO",
  ): Promise<void> {
    await this.wordPreparationStage.handleWordCallback(gameId, telegramUserId, action, value);
  }

  async handlePrivateStart(telegramUserId: string): Promise<void> {
    const games = this.repository.listActiveGames();
    const matched = games.filter((game) => game.players.some((player) => player.telegramUserId === telegramUserId));

    for (const game of matched) {
      this.transactionRunner.runInTransaction(() => {
        const current = this.context.requireGameById(game.id);
        const player = this.context.requirePlayerByTelegram(current, telegramUserId);
        this.engine.markDmOpened(current, player.id, this.clock.nowIso());
        this.repository.update(current);
      });
    }

    if (matched.length === 0) {
      await this.notifier.sendPrivateMessage(telegramUserId, this.texts.noActiveGamesForUser());
      return;
    }

    await this.notifier.sendPrivateMessage(telegramUserId, this.texts.privateChatActivated());
  }

  async recoverManualPairingPromptsOnStartup(): Promise<void> {
    await this.normalPairingStage.recoverPromptsOnStartup();
  }

  async handleGroupText(chatId: string, telegramUserId: string, text: string): Promise<void> {
    const game = this.repository.findActiveByChatId(chatId);
    if (!game?.config?.mode) {
      return;
    }

    await this.getModeService(game.config.mode).handleGroupText(chatId, telegramUserId, text);
  }

  async askOffline(chatId: string, telegramUserId: string): Promise<void> {
    const game = this.repository.findActiveByChatId(chatId);
    if (!game?.config?.mode) {
      return;
    }

    await this.getModeService(game.config.mode).askOffline(chatId, telegramUserId);
  }

  async handleVote(gameId: string, telegramUserId: string, decision: VoteDecision): Promise<void> {
    const game = this.context.requireGameById(gameId);
    if (!game.config?.mode) {
      throw new DomainError({ code: "GAME_CONFIGURATION_NOT_SET" });
    }

    await this.getModeService(game.config.mode).handleVote(gameId, telegramUserId, decision);
  }

  async giveUp(chatId: string, telegramUserId: string): Promise<void> {
    const game = this.repository.findActiveByChatId(chatId);
    if (!game) {
      return;
    }

    if (game.stage !== "IN_PROGRESS") {
      await this.notifier.sendGroupMessage(chatId, this.texts.giveUpOnlyDuringGame());
      return;
    }

    if (!game.config?.mode) {
      return;
    }

    await this.getModeService(game.config.mode).giveUp(chatId, telegramUserId);
  }

  async cancel(chatId: string, telegramUserId: string): Promise<void> {
    const game = this.repository.findActiveByChatId(chatId);
    if (!game) {
      return;
    }

    const actor = this.context.requirePlayerByTelegram(game, telegramUserId);
    if (actor.id !== game.creatorPlayerId) {
      throw new DomainError({ code: "ONLY_GAME_CREATOR_CAN_CANCEL" });
    }

    const updated = this.transactionRunner.runInTransaction(() => {
      const current = this.context.requireGameById(game.id);
      const next = this.engine.cancelGame(current, "Canceled by creator", this.clock.nowIso());
      this.repository.update(next);
      return next;
    });

    await this.notifier.sendGroupMessage(updated.chatId, this.texts.gameCancelledByCreator());
  }

  private getModeService(mode: GameMode): GameModeService {
    const service = this.modeServices.get(mode);
    if (!service) {
      throw new DomainError({ code: "UNKNOWN_GAME_MODE", params: { mode } });
    }
    return service;
  }
}
