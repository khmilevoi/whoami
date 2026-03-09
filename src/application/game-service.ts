import { GameEngine } from "../domain/game-engine";
import { DomainError } from "../domain/errors";
import { gameModeLabel } from "../domain/stats";
import { ConfigureGameInput, GameMode, GameState, PairingMode, PlayMode, VoteDecision } from "../domain/types";
import { ClockPort, GameRepository, IdPort, IdentityPort, LoggerPort, NotifierPort, TransactionRunner } from "./ports";

interface ActorInput {
  telegramUserId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
}

interface ConfigDraft {
  mode?: GameMode;
  playMode?: PlayMode;
  pairingMode?: PairingMode;
}

type TextExpectation = "WORD" | "CLUE";

export class GameService {
  private readonly configDrafts = new Map<string, ConfigDraft>();
  private readonly privateExpectations = new Map<string, TextExpectation>();

  constructor(
    private readonly engine: GameEngine,
    private readonly repository: GameRepository,
    private readonly transactionRunner: TransactionRunner,
    private readonly notifier: NotifierPort,
    private readonly identity: IdentityPort,
    private readonly idPort: IdPort,
    private readonly clock: ClockPort,
    private readonly logger: LoggerPort,
    private readonly limits: { minPlayers: number; maxPlayers: number },
  ) {}

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
        throw new DomainError("В этом чате уже идет активная игра. Завершите ее перед стартом новой.");
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

    await this.notifier.sendGroupMessage(
      chatId,
      `Игра запущена. Создатель: ${player.displayName}. Для входа используйте /join.`,
    );

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
      const current = this.requireGameByChat(chatId);
      const updated = this.engine.joinGame(current, player, this.limits, this.clock.nowIso());
      this.repository.update(updated);
      return updated;
    });

    await this.notifier.sendGroupMessage(
      chatId,
      `${player.displayName} присоединился. Игроков: ${game.players.length}.`,
    );
  }

  async beginConfiguration(chatId: string, actorTelegramUserId: string): Promise<void> {
    const now = this.clock.nowIso();

    const game = this.transactionRunner.runInTransaction(() => {
      const current = this.requireGameByChat(chatId);
      const actorPlayer = this.requirePlayerByTelegram(current, actorTelegramUserId);
      const updated = this.engine.closeLobby(current, actorPlayer.id, this.limits, now);
      this.repository.update(updated);
      return updated;
    });

    const creator = game.players.find((p) => p.id === game.creatorPlayerId);
    if (!creator) {
      return;
    }

    await this.notifier.sendGroupMessage(chatId, "Набор игроков закрыт. Создатель настраивает режим в ЛС бота.");

    const ok = await this.notifier.sendPrivateKeyboard(
      creator.telegramUserId,
      "Выберите режим игры:",
      [[{ text: "Обычный", data: `cfg:mode:NORMAL:${game.id}` }], [{ text: "Обратный", data: `cfg:mode:REVERSE:${game.id}` }]],
    );

    if (!ok) {
      this.transactionRunner.runInTransaction(() => {
        const current = this.requireGameById(game.id);
        this.engine.markDmBlocked(current, creator.id, this.clock.nowIso());
        this.repository.update(current);
      });

      await this.notifier.sendGroupMessage(
        chatId,
        `Создатель не открыл ЛС с ботом. Откройте: ${this.notifier.buildBotDeepLink()}`,
      );
    }
  }

  async applyConfigStep(gameId: string, actorTelegramUserId: string, key: "mode" | "play" | "pair", value: string): Promise<void> {
    const game = this.requireGameById(gameId);
    const actor = this.requirePlayerByTelegram(game, actorTelegramUserId);

    if (actor.id !== game.creatorPlayerId) {
      throw new DomainError("Только создатель игры может настраивать режим");
    }

    const draft = this.configDrafts.get(gameId) ?? {};

    if (key === "mode") {
      draft.mode = value as GameMode;
    }
    if (key === "play") {
      draft.playMode = value as PlayMode;
    }
    if (key === "pair") {
      draft.pairingMode = value as PairingMode;
    }

    this.configDrafts.set(gameId, draft);

    if (!draft.mode) {
      return;
    }

    if (!draft.playMode) {
      await this.notifier.sendPrivateKeyboard(
        actorTelegramUserId,
        "Выберите формат:",
        [[{ text: "Онлайн", data: `cfg:play:ONLINE:${gameId}` }], [{ text: "Оффлайн", data: `cfg:play:OFFLINE:${gameId}` }]],
      );
      return;
    }

    if (draft.mode === "NORMAL" && !draft.pairingMode) {
      await this.notifier.sendPrivateKeyboard(
        actorTelegramUserId,
        "Выберите распределение пар:",
        [[{ text: "Случайно", data: `cfg:pair:RANDOM:${gameId}` }], [{ text: "Ручной", data: `cfg:pair:MANUAL:${gameId}` }]],
      );
      return;
    }

    const now = this.clock.nowIso();
    const configured = this.transactionRunner.runInTransaction(() => {
      const current = this.requireGameById(gameId);
      const updateInput: ConfigureGameInput = {
        actorPlayerId: actor.id,
        mode: draft.mode!,
        playMode: draft.playMode!,
        pairingMode: draft.mode === "NORMAL" ? draft.pairingMode : undefined,
      };

      const updated = this.engine.configureGame(current, updateInput, now);
      this.repository.update(updated);
      return updated;
    });

    this.configDrafts.delete(gameId);

    await this.notifier.sendGroupMessage(
      configured.chatId,
      `Конфигурация сохранена: ${gameModeLabel(configured.config!.mode)}, ${
        configured.config!.playMode === "ONLINE" ? "онлайн" : "оффлайн"
      }${configured.config!.pairingMode ? `, пары: ${configured.config!.pairingMode === "RANDOM" ? "случайно" : "ручной"}` : ""}.`,
    );

    if (configured.config?.mode === "NORMAL" && configured.config.pairingMode === "MANUAL" && Object.keys(configured.words).length === 0) {
      await this.promptManualPairChooser(configured);
      return;
    }

    await this.promptWordCollection(configured);
  }

  async applyManualPair(gameId: string, chooserTelegramUserId: string, targetPlayerId: string): Promise<void> {
    const now = this.clock.nowIso();

    const updated = this.transactionRunner.runInTransaction(() => {
      const current = this.requireGameById(gameId);
      const chooser = this.requirePlayerByTelegram(current, chooserTelegramUserId);
      const next = this.engine.selectManualPair(current, chooser.id, targetPlayerId, now);
      this.repository.update(next);
      return next;
    });

    if (Object.keys(updated.words).length < updated.players.length) {
      await this.promptManualPairChooser(updated);
      return;
    }

    await this.notifier.sendGroupMessage(updated.chatId, "Ручное распределение завершено. Переходим к вводу слов.");
    await this.promptWordCollection(updated);
  }

  async handlePrivateText(telegramUserId: string, text: string): Promise<void> {
    const game = this.findActiveGameByTelegramUser(telegramUserId);
    if (!game) {
      return;
    }

    const player = this.requirePlayerByTelegram(game, telegramUserId);
    const key = this.expectationKey(game.id, player.id);
    const expected = this.privateExpectations.get(key) ?? "WORD";

    if (game.stage !== "PREPARE_WORDS" && game.stage !== "READY_WAIT") {
      return;
    }

    if (!game.words[player.id]) {
      await this.notifier.sendPrivateMessage(telegramUserId, "Ожидайте завершения распределения пар.");
      return;
    }

    if (expected === "CLUE") {
      const updated = this.transactionRunner.runInTransaction(() => {
        const current = this.requireGameById(game.id);
        const next = this.engine.submitClue(current, player.id, text, this.clock.nowIso());
        this.repository.update(next);
        return next;
      });

      this.privateExpectations.delete(key);
      await this.sendWordSummary(updated, player.id);
      return;
    }

    const updated = this.transactionRunner.runInTransaction(() => {
      const current = this.requireGameById(game.id);
      const next = this.engine.submitWord(current, player.id, text, this.clock.nowIso());
      this.repository.update(next);
      return next;
    });

    await this.notifier.sendPrivateKeyboard(
      telegramUserId,
      `Подтвердите слово: "${updated.words[player.id].word}"`,
      [[{ text: "Да", data: `word:confirm:YES:${game.id}` }, { text: "Нет", data: `word:confirm:NO:${game.id}` }]],
    );
  }

  async handleWordCallback(
    gameId: string,
    telegramUserId: string,
    action: "confirm" | "clue" | "final",
    value: "YES" | "NO",
  ): Promise<void> {
    const playerGame = this.requireGameById(gameId);
    const player = this.requirePlayerByTelegram(playerGame, telegramUserId);
    const key = this.expectationKey(gameId, player.id);

    if (action === "confirm") {
      const updated = this.transactionRunner.runInTransaction(() => {
        const current = this.requireGameById(gameId);
        const next = this.engine.confirmWord(current, player.id, value === "YES", this.clock.nowIso());
        this.repository.update(next);
        return next;
      });

      if (value === "NO") {
        this.privateExpectations.set(key, "WORD");
        await this.notifier.sendPrivateMessage(telegramUserId, "Введите слово заново:");
        return;
      }

      await this.notifier.sendPrivateKeyboard(
        telegramUserId,
        "Добавить пояснение к слову?",
        [[{ text: "Да", data: `word:clue:YES:${gameId}` }, { text: "Нет", data: `word:clue:NO:${gameId}` }]],
      );

      await this.sendWordSummary(updated, player.id, false);
      return;
    }

    if (action === "clue") {
      if (value === "YES") {
        this.privateExpectations.set(key, "CLUE");
        await this.notifier.sendPrivateMessage(telegramUserId, "Введите пояснение:");
        return;
      }

      const updated = this.transactionRunner.runInTransaction(() => {
        const current = this.requireGameById(gameId);
        const next = this.engine.submitClue(current, player.id, undefined, this.clock.nowIso());
        this.repository.update(next);
        return next;
      });

      this.privateExpectations.delete(key);
      await this.sendWordSummary(updated, player.id);
      return;
    }

    const updated = this.transactionRunner.runInTransaction(() => {
      const current = this.requireGameById(gameId);
      const next = this.engine.finalizeWord(current, player.id, value === "YES", this.clock.nowIso());
      this.repository.update(next);
      return next;
    });

    if (value === "NO") {
      this.privateExpectations.set(key, "WORD");
      await this.notifier.sendPrivateMessage(telegramUserId, "Ок, заполним слово заново. Введите слово:");
      return;
    }

    this.privateExpectations.delete(key);
    await this.notifier.sendPrivateMessage(telegramUserId, "Готово. Ожидаем остальных игроков.");
    await this.tryStartGame(updated.id);
  }

  async handlePrivateStart(telegramUserId: string): Promise<void> {
    const games = this.repository.listActiveGames();
    const matched = games.filter((g) => g.players.some((p) => p.telegramUserId === telegramUserId));

    for (const game of matched) {
      this.transactionRunner.runInTransaction(() => {
        const current = this.requireGameById(game.id);
        const player = this.requirePlayerByTelegram(current, telegramUserId);
        this.engine.markDmOpened(current, player.id, this.clock.nowIso());
        this.repository.update(current);
      });
    }

    if (matched.length === 0) {
      await this.notifier.sendPrivateMessage(telegramUserId, "Активных игр для вас не найдено.");
      return;
    }

    await this.notifier.sendPrivateMessage(telegramUserId, "ЛС активирован. Если вы в игре, продолжайте шаги здесь.");
  }

  async recoverManualPairingPromptsOnStartup(): Promise<void> {
    const activeGames = this.repository.listActiveGames();

    for (const game of activeGames) {
      if (game.stage !== "PREPARE_WORDS") {
        continue;
      }

      if (game.config?.mode !== "NORMAL" || game.config.pairingMode !== "MANUAL") {
        continue;
      }

      if (game.preparation.manualPairingCursor >= game.preparation.manualPairingQueue.length) {
        continue;
      }

      await this.promptManualPairChooser(game);
    }
  }
  async handleGroupText(chatId: string, telegramUserId: string, text: string): Promise<void> {
    const game = this.repository.findActiveByChatId(chatId);
    if (!game || game.stage !== "IN_PROGRESS" || game.config?.playMode !== "ONLINE") {
      return;
    }

    const actor = game.players.find((p) => p.telegramUserId === telegramUserId);
    if (!actor) {
      return;
    }

    await this.startQuestion(game.id, actor.id, text);
  }

  async askOffline(chatId: string, telegramUserId: string): Promise<void> {
    const game = this.repository.findActiveByChatId(chatId);
    if (!game || game.stage !== "IN_PROGRESS" || game.config?.playMode !== "OFFLINE") {
      return;
    }

    const actor = game.players.find((p) => p.telegramUserId === telegramUserId);
    if (!actor) {
      return;
    }

    await this.startQuestion(game.id, actor.id, undefined);
  }

  async handleVote(gameId: string, telegramUserId: string, decision: VoteDecision): Promise<void> {
    const game = this.requireGameById(gameId);
    const voter = this.requirePlayerByTelegram(game, telegramUserId);

    const updated = this.transactionRunner.runInTransaction(() => {
      const current = this.requireGameById(gameId);
      const next = this.engine.castVote(current, {
        voterPlayerId: voter.id,
        decision,
        voteRecordId: this.idPort.nextId(),
        turnRecordId: this.idPort.nextId(),
        now: this.clock.nowIso(),
      });
      this.repository.update(next);
      return next;
    });

    if (updated.inProgress.pendingVote) {
      return;
    }

    const lastTurn = updated.turns[updated.turns.length - 1];
    if (lastTurn) {
      await this.notifier.sendGroupMessage(updated.chatId, `Итог голосования: ${this.outcomeLabel(lastTurn.outcome)}.`);
    }

    if (updated.stage === "FINISHED") {
      await this.sendFinalSummary(updated);
      return;
    }

    await this.announceCurrentTurn(updated);
  }

  async giveUp(chatId: string, telegramUserId: string): Promise<void> {
    const game = this.repository.findActiveByChatId(chatId);
    if (!game) {
      return;
    }

    if (game.stage !== "IN_PROGRESS") {
      await this.notifier.sendGroupMessage(chatId, "Команда /giveup доступна только во время игрового этапа.");
      return;
    }

    const player = this.requirePlayerByTelegram(game, telegramUserId);

    const updated = this.transactionRunner.runInTransaction(() => {
      const current = this.requireGameById(game.id);
      const next = this.engine.giveUp(current, {
        playerId: player.id,
        turnRecordId: this.idPort.nextId(),
        now: this.clock.nowIso(),
      });
      this.repository.update(next);
      return next;
    });

    await this.notifier.sendGroupMessage(chatId, `${player.displayName} сдался.`);

    if (updated.stage === "FINISHED") {
      await this.sendFinalSummary(updated);
      return;
    }

    await this.announceCurrentTurn(updated);
  }

  async cancel(chatId: string, telegramUserId: string): Promise<void> {
    const game = this.repository.findActiveByChatId(chatId);
    if (!game) {
      return;
    }

    const actor = this.requirePlayerByTelegram(game, telegramUserId);
    if (actor.id !== game.creatorPlayerId) {
      throw new DomainError("Только создатель игры может отменить игру");
    }

    const updated = this.transactionRunner.runInTransaction(() => {
      const current = this.requireGameById(game.id);
      const next = this.engine.cancelGame(current, "Canceled by creator", this.clock.nowIso());
      this.repository.update(next);
      return next;
    });

    await this.notifier.sendGroupMessage(updated.chatId, "Игра отменена создателем.");
  }

  private async startQuestion(gameId: string, actorPlayerId: string, questionText?: string): Promise<void> {
    const updated = this.transactionRunner.runInTransaction(() => {
      const current = this.requireGameById(gameId);
      const next = this.engine.askQuestion(current, {
        actorPlayerId,
        questionText,
        voteId: this.idPort.nextId(),
        now: this.clock.nowIso(),
      });
      this.repository.update(next);
      return next;
    });

    const pending = updated.inProgress.pendingVote;
    if (!pending) {
      return;
    }

    if (updated.config?.mode === "NORMAL") {
      await this.notifier.sendGroupKeyboard(
        updated.chatId,
        `${this.playerLabel(updated, pending.askerPlayerId)} задал вопрос. Голосуем:`,
        [[
          { text: "Да", data: `vote:YES:${updated.id}` },
          { text: "Нет", data: `vote:NO:${updated.id}` },
          { text: "Угадал", data: `vote:GUESSED:${updated.id}` },
        ]],
      );
    } else {
      const targetPlayerId = pending.targetWordOwnerId;
      if (!targetPlayerId) {
        return;
      }

      const target = updated.players.find((p) => p.id === targetPlayerId);
      if (!target) {
        return;
      }

      await this.notifier.sendPrivateKeyboard(
        target.telegramUserId,
        `${this.playerLabel(updated, pending.askerPlayerId)} задал вопрос. Выберите ответ:`,
        [[
          { text: "Да", data: `vote:YES:${updated.id}` },
          { text: "Нет", data: `vote:NO:${updated.id}` },
          { text: "Угадал", data: `vote:GUESSED:${updated.id}` },
        ]],
      );
    }
  }

  private async promptManualPairChooser(game: GameState): Promise<void> {
    const chooserId = game.preparation.manualPairingQueue[game.preparation.manualPairingCursor];
    const chooser = game.players.find((p) => p.id === chooserId);
    if (!chooser) {
      return;
    }

    const usedTargets = new Set(Object.values(game.pairings));
    const buttons = game.players
      .filter((p) => p.id !== chooser.id)
      .filter((p) => !usedTargets.has(p.id))
      .map((p) => [{ text: this.playerLabel(game, p.id), data: `pair:${p.id}:${game.id}` }]);

    const ok = await this.notifier.sendPrivateKeyboard(chooser.telegramUserId, "Выберите игрока, которому загадываете слово:", buttons);
    if (!ok) {
      await this.notifier.sendGroupMessage(
        game.chatId,
        `${this.playerLabel(game, chooser.id)} не открыл ЛС. Откройте: ${this.notifier.buildBotDeepLink()}`,
      );
    }
  }

  private async promptWordCollection(game: GameState): Promise<void> {
    for (const player of game.players) {
      const ok = await this.notifier.sendPrivateMessage(player.telegramUserId, "Введите слово для игры:");
      if (!ok) {
        this.transactionRunner.runInTransaction(() => {
          const current = this.requireGameById(game.id);
          this.engine.markDmBlocked(current, player.id, this.clock.nowIso());
          this.repository.update(current);
        });

        await this.notifier.sendGroupMessage(
          game.chatId,
          `${this.playerLabel(game, player.id)} не открыл ЛС. Ссылка: ${this.notifier.buildBotDeepLink()}`,
        );
      }

      this.privateExpectations.set(this.expectationKey(game.id, player.id), "WORD");
    }
  }

  private async sendWordSummary(game: GameState, playerId: string, includeButtons = true): Promise<void> {
    const player = game.players.find((p) => p.id === playerId);
    if (!player) {
      return;
    }

    const entry = game.words[playerId];
    if (!entry) {
      return;
    }

    const text = [
      `Слово: ${entry.word ?? "-"}`,
      `Пояснение: ${entry.clue ?? "(нет)"}`,
      "Подтвердить?",
    ].join("\n");

    if (!includeButtons) {
      await this.notifier.sendPrivateMessage(player.telegramUserId, text);
      return;
    }

    await this.notifier.sendPrivateKeyboard(
      player.telegramUserId,
      text,
      [[{ text: "Подтвердить", data: `word:final:YES:${game.id}` }, { text: "Редактировать", data: `word:final:NO:${game.id}` }]],
    );
  }

  private async tryStartGame(gameId: string): Promise<void> {
    const started = this.transactionRunner.runInTransaction(() => {
      const current = this.requireGameById(gameId);
      const before = current.stage;
      const next = this.engine.startGameIfReady(current, this.clock.nowIso());
      this.repository.update(next);
      return { before, game: next };
    });

    if (started.before === started.game.stage || started.game.stage !== "IN_PROGRESS") {
      return;
    }

    if (started.game.config?.mode === "NORMAL") {
      for (const player of started.game.players) {
        const visibleWords = Object.values(started.game.words)
          .filter((entry) => entry.targetPlayerId !== player.id)
          .map((entry) => `- ${entry.word}${entry.clue ? ` (${entry.clue})` : ""}`)
          .join("\n");

        await this.notifier.sendPrivateMessage(
          player.telegramUserId,
          `Список слов других игроков:\n${visibleWords || "(нет данных)"}`,
        );
      }
    }

    await this.notifier.sendGroupMessage(started.game.chatId, "Все готовы. Игра начинается.");
    await this.announceCurrentTurn(started.game);
  }

  private async announceCurrentTurn(game: GameState): Promise<void> {
    const currentAskerId = game.inProgress.turnOrder[game.inProgress.turnCursor];
    if (!currentAskerId) {
      return;
    }

    const label = this.playerLabel(game, currentAskerId);

    if (game.config?.mode === "REVERSE" && game.inProgress.currentTargetPlayerId) {
      const targetLabel = this.playerLabel(game, game.inProgress.currentTargetPlayerId);
      await this.notifier.sendGroupMessage(
        game.chatId,
        `Сейчас угадываем слово игрока ${targetLabel}. Ход задавать вопрос у ${label}.`,
      );
    } else {
      await this.notifier.sendGroupMessage(game.chatId, `Ход игрока ${label}.`);
    }

    if (game.config?.playMode === "OFFLINE") {
      await this.notifier.sendGroupKeyboard(
        game.chatId,
        `${label}, нажмите, когда хотите запустить опрос по вопросу.`,
        [[{ text: "Запустить опрос", data: `ask:${game.id}` }]],
      );
    }
  }

  private async sendFinalSummary(game: GameState): Promise<void> {
    if (!game.result) {
      await this.notifier.sendGroupMessage(game.chatId, "Игра завершена.");
      return;
    }

    if (game.result.normal) {
      const lines = game.result.normal.map((row) => {
        const crown = row.crowns.length > 0 ? " 👑" : "";
        return `- ${this.playerLabel(game, row.playerId)}: ${row.rounds}/${row.questions}${crown}`;
      });
      await this.notifier.sendGroupMessage(game.chatId, `Сводка (обычный режим):\n${lines.join("\n")}`);
      return;
    }

    const owner = game.result.reverse?.asWordOwner ?? [];
    const guesser = game.result.reverse?.asGuesser ?? [];

    const ownerText = owner
      .map((row) => `- ${this.playerLabel(game, row.playerId)}: ${row.rounds}/${row.questions}${row.crowns.length ? " 👑" : ""}`)
      .join("\n");

    const guesserText = guesser
      .map((row) => {
        const avgRounds = row.avgRounds ?? 0;
        const avgQuestions = row.avgQuestions ?? 0;
        return `- ${this.playerLabel(game, row.playerId)}: ${avgRounds}/${avgQuestions}${row.crowns.length ? " 👑" : ""}`;
      })
      .join("\n");

    await this.notifier.sendGroupMessage(
      game.chatId,
      `Сводка (обратный режим):\nЗагадывали:\n${ownerText || "-"}\n\nУгадывали:\n${guesserText || "-"}`,
    );
  }

  private requireGameByChat(chatId: string): GameState {
    const game = this.repository.findActiveByChatId(chatId);
    if (!game) {
      throw new DomainError("Активная игра в этом чате не найдена");
    }
    return game;
  }

  private requireGameById(gameId: string): GameState {
    const game = this.repository.findById(gameId);
    if (!game) {
      throw new DomainError("Игра не найдена");
    }
    return game;
  }

  private findActiveGameByTelegramUser(telegramUserId: string): GameState | null {
    const active = this.repository.listActiveGames();
    return active.find((game) => game.players.some((player) => player.telegramUserId === telegramUserId)) ?? null;
  }

  private requirePlayerByTelegram(game: GameState, telegramUserId: string) {
    const player = game.players.find((p) => p.telegramUserId === telegramUserId);
    if (!player) {
      throw new DomainError("Игрок не найден в этой игре");
    }
    return player;
  }

  private playerLabel(game: GameState, playerId: string): string {
    const player = game.players.find((p) => p.id === playerId);
    if (!player) {
      return playerId;
    }

    return `${player.displayName}${player.username ? ` (@${player.username})` : ""}`;
  }

  private expectationKey(gameId: string, playerId: string): string {
    return `${gameId}:${playerId}`;
  }

  private outcomeLabel(outcome: string): string {
    if (outcome === "YES") {
      return "Да";
    }
    if (outcome === "NO") {
      return "Нет";
    }
    if (outcome === "GUESSED") {
      return "Угадал";
    }
    return "Сдался";
  }
}

