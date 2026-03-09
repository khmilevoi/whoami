import { DomainErrorPayload } from "../domain/errors";
import { GameMode, PairingMode, PlayMode, TurnRecord, VoteDecision } from "../domain/types";

export type SupportedLocale = "ru";

interface ConfigSavedInput {
  mode: GameMode;
  playMode: PlayMode;
  pairingMode?: PairingMode;
}

type VoteOutcome = TurnRecord["outcome"];

export class TextService {
  constructor(readonly locale: SupportedLocale) {}

  renderError(error: DomainErrorPayload): string {
    switch (error.code) {
      case "INVALID_MANUAL_PAIR_PAYLOAD":
        return "Некорректные данные выбора пары";
      case "ACTIVE_GAME_NOT_FOUND_BY_CHAT":
        return "Активная игра в этом чате не найдена";
      case "GAME_NOT_FOUND":
        return "Игра не найдена";
      case "PLAYER_NOT_FOUND_IN_GAME":
        return "Игрок не найден в этой игре";
      case "ACTIVE_GAME_ALREADY_EXISTS_IN_CHAT":
        return "В этом чате уже идет активная игра. Завершите ее перед стартом новой.";
      case "GAME_CONFIGURATION_NOT_SET":
      case "GAME_CONFIGURATION_MISSING":
        return "Конфигурация игры не задана";
      case "ONLY_GAME_CREATOR_CAN_CANCEL":
        return "Только создатель игры может отменить игру";
      case "UNKNOWN_GAME_MODE":
        return `Неизвестный режим игры: ${error.params.mode}`;
      case "ONLY_GAME_CREATOR_CAN_CONFIGURE":
        return "Только создатель игры может настраивать режим";
      case "JOIN_ALLOWED_ONLY_WHEN_LOBBY_OPEN":
        return "Присоединиться можно только пока открыт набор игроков";
      case "MAX_PLAYERS_REACHED":
        return `Достигнут максимум игроков: ${error.params.maxPlayers}.`;
      case "LOBBY_ALREADY_CLOSED":
        return "Набор игроков уже закрыт";
      case "ONLY_GAME_CREATOR_CAN_CLOSE_LOBBY":
        return "Только создатель игры может закрыть набор игроков";
      case "MIN_PLAYERS_REQUIRED_TO_START":
        return `Для старта нужно минимум ${error.params.minPlayers} игрока(ов).`;
      case "GAME_CAN_BE_CONFIGURED_ONLY_AFTER_LOBBY_CLOSED":
        return "Настраивать игру можно только после закрытия набора игроков";
      case "PAIRING_MODE_REQUIRED_FOR_NORMAL_MODE":
        return "Для обычного режима нужно выбрать распределение пар";
      case "MANUAL_PAIRING_AVAILABLE_ONLY_FOR_NORMAL_MANUAL_MODE":
        return "Ручное распределение доступно только для обычного режима с ручным выбором пар";
      case "NOT_PLAYERS_TURN_TO_PICK_PAIR":
        return "Сейчас не ход этого игрока для выбора пары";
      case "WORD_CANNOT_BE_EMPTY":
        return "Слово не может быть пустым";
      case "WORD_MUST_BE_SUBMITTED_BEFORE_CONFIRMATION":
        return "Сначала нужно ввести слово";
      case "WORD_MUST_BE_CONFIRMED_BEFORE_CLUE_SUBMISSION":
        return "Сначала подтвердите слово, потом добавляйте пояснение";
      case "WORD_MUST_BE_CONFIRMED_BEFORE_FINALIZATION":
        return "Сначала подтвердите слово";
      case "NOT_ALL_PLAYERS_CONFIRMED_WORDS":
        return "Не все игроки подтвердили слова";
      case "PENDING_VOTE_MUST_BE_RESOLVED_FIRST":
        return "Сначала нужно завершить текущее голосование";
      case "QUESTION_TEXT_REQUIRED_IN_ONLINE_MODE":
        return "В онлайн-режиме нужно отправить текст вопроса";
      case "NOT_PLAYERS_TURN":
        return "Сейчас не ход этого игрока";
      case "REVERSE_MODE_TARGET_MISSING":
        return "Не удалось определить игрока, чье слово сейчас угадывают";
      case "NO_PENDING_VOTE":
        return "Нет активного голосования";
      case "PLAYER_NOT_ALLOWED_TO_VOTE":
        return "Этот игрок не может голосовать в текущем опросе";
      case "REVERSE_VOTE_TARGET_MISSING":
        return "Не удалось определить цель голосования в обратном режиме";
      case "NO_ACTIVE_PLAYERS_LEFT":
        return "Не осталось активных игроков";
      case "UNABLE_TO_RESOLVE_CURRENT_ASKER":
        return "Не удалось определить текущего задающего вопрос";
      case "REVERSE_MODE_ASKER_MISSING":
        return "Не удалось определить текущего задающего вопрос в обратном режиме";
      case "WORD_ACTIONS_NOT_AVAILABLE_IN_CURRENT_STAGE":
        return "Сейчас нельзя выполнять действия со словом";
      case "EXPECTED_STAGE_MISMATCH":
        return `Ожидался этап ${error.params.expectedStage}, получен ${error.params.actualStage}`;
      case "PLAYER_NOT_FOUND":
        return "Игрок не найден";
      case "WORD_ENTRY_FOR_PLAYER_MISSING":
        return "Для игрока не найдено слово";
      case "NEED_AT_LEAST_TWO_PLAYERS_FOR_PAIRINGS":
        return "Для распределения пар нужно минимум два игрока";
      case "UNKNOWN_PLAYER_IN_MANUAL_PAIRING":
        return "В ручном распределении указан неизвестный игрок";
      case "PLAYER_CANNOT_PAIR_WITH_SELF":
        return "Нельзя назначить игрока самому себе";
      case "PLAYER_HAS_ALREADY_SELECTED_A_PAIR":
        return "Игрок уже выбрал пару";
      case "SELECTED_TARGET_IS_ALREADY_TAKEN":
        return "Выбранный игрок уже занят";
      default:
        return this.genericErrorRetry();
    }
  }

  commandOpenPrivateChatDescription(): string {
    return "Открыть личный чат с ботом";
  }

  commandCreateGameDescription(): string {
    return "Создать новую игру";
  }

  commandJoinGameDescription(): string {
    return "Войти в игру";
  }

  commandConfigureGameDescription(): string {
    return "Закрыть набор и настроить";
  }

  commandCancelGameDescription(): string {
    return "Отменить игру";
  }

  commandGiveUpDescription(): string {
    return "Сдаться";
  }

  commandAskOfflineDescription(): string {
    return "Запустить опрос (оффлайн)";
  }

  genericErrorRetry(): string {
    return "Произошла ошибка. Попробуйте еще раз.";
  }

  groupOnlyCommand(): string {
    return "Эта команда доступна только в групповом чате.";
  }

  gameCreatedAck(): string {
    return "Игра создана.";
  }

  joinedGameAck(): string {
    return "Вы в игре.";
  }

  configSentToCreatorAck(): string {
    return "Настройка отправлена в ЛС создателю.";
  }

  gameCancelledAck(): string {
    return "Игра отменена.";
  }

  onlineModeDisabledMessage(): string {
    return [
      "Онлайн-режим недоступен: у бота включен privacy mode, поэтому он не видит обычные сообщения в группе.",
      "Отключите его в @BotFather: /mybots -> ваш бот -> Bot Settings -> Group Privacy -> Turn off.",
      "После этого повторите выбор онлайн-режима.",
    ].join("\n");
  }

  onlineModeDisabledAlert(): string {
    return "Онлайн недоступен: отключите Group Privacy";
  }

  onlineModeUnknownMessage(): string {
    return [
      "Онлайн-режим временно недоступен: не удалось проверить, может ли бот читать сообщения в группе.",
      "Проверьте настройки в @BotFather (Group Privacy: Turn off) и повторите попытку.",
    ].join("\n");
  }

  onlineModeUnknownAlert(): string {
    return "Онлайн недоступен: не удалось проверить настройки";
  }

  gameStarted(creatorName: string): string {
    return `Игра запущена. Создатель: ${creatorName}. Для входа используйте /join.`;
  }

  playerJoined(name: string, count: number): string {
    return `${name} присоединился. Игроков: ${count}.`;
  }

  lobbyClosedConfiguringInPrivate(): string {
    return "Набор игроков закрыт. Создатель настраивает режим в ЛС бота.";
  }

  chooseGameModePrompt(): string {
    return "Выберите режим игры:";
  }

  gameModeButton(mode: GameMode): string {
    return mode === "NORMAL" ? "Обычный" : "Обратный";
  }

  creatorDmRequired(deepLink: string): string {
    return `Создатель не открыл ЛС с ботом. Откройте: ${deepLink}`;
  }

  dmLinkRequired(playerLabel: string, deepLink: string): string {
    return `${playerLabel} не открыл ЛС. Откройте: ${deepLink}`;
  }

  dmLinkWithLabel(playerLabel: string, deepLink: string): string {
    return `${playerLabel} не открыл ЛС. Ссылка: ${deepLink}`;
  }

  noActiveGamesForUser(): string {
    return "Активных игр для вас не найдено.";
  }

  privateChatActivated(): string {
    return "ЛС активирован. Если вы в игре, продолжайте шаги здесь.";
  }

  giveUpOnlyDuringGame(): string {
    return "Команда /giveup доступна только во время игрового этапа.";
  }

  gameCancelledByCreator(): string {
    return "Игра отменена создателем.";
  }

  voteOutcome(outcome: VoteOutcome): string {
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

  voteDecisionButton(decision: VoteDecision): string {
    if (decision === "YES") {
      return "Да";
    }
    if (decision === "NO") {
      return "Нет";
    }
    return "Угадал";
  }

  voteSummary(outcome: VoteOutcome): string {
    return `Итог голосования: ${this.voteOutcome(outcome)}.`;
  }

  playerGaveUp(name: string): string {
    return `${name} сдался.`;
  }

  currentTurn(label: string): string {
    return `Ход игрока ${label}.`;
  }

  askOfflinePrompt(label: string): string {
    return `${label}, нажмите, когда хотите запустить опрос по вопросу.`;
  }

  startPollButton(): string {
    return "Запустить опрос";
  }

  otherPlayersWordsList(visibleWords: string): string {
    return `Список слов других игроков:\n${visibleWords || "(нет данных)"}`;
  }

  gameFinished(): string {
    return "Игра завершена.";
  }

  normalSummary(lines: string[]): string {
    return `Сводка (обычный режим):\n${lines.join("\n")}`;
  }

  votePrompt(askerLabel: string): string {
    return `${askerLabel} задал вопрос. Голосуем:`;
  }

  reverseTargetTurn(targetLabel: string, askerLabel: string): string {
    return `Сейчас угадываем слово игрока ${targetLabel}. Ход задавать вопрос у ${askerLabel}.`;
  }

  reverseSummary(ownerText: string, guesserText: string): string {
    return `Сводка (обратный режим):\nЗагадывали:\n${ownerText || "-"}\n\nУгадывали:\n${guesserText || "-"}`;
  }

  reverseVotePrompt(askerLabel: string, targetLabel: string): string {
    return `${askerLabel} задал вопрос. Отвечает ${targetLabel}:`;
  }

  choosePlayModePrompt(): string {
    return "Выберите формат:";
  }

  playModeButton(mode: PlayMode): string {
    return mode === "ONLINE" ? "Онлайн" : "Оффлайн";
  }

  choosePairingModePrompt(): string {
    return "Выберите распределение пар:";
  }

  pairingModeButton(mode: PairingMode): string {
    return mode === "RANDOM" ? "Случайно" : "Ручной";
  }

  gameMode(mode: GameMode): string {
    return mode === "NORMAL" ? "обычный" : "обратный";
  }

  playMode(mode: PlayMode): string {
    return mode === "ONLINE" ? "онлайн" : "оффлайн";
  }

  pairingMode(mode: PairingMode): string {
    return mode === "RANDOM" ? "случайно" : "ручной";
  }

  configSaved(input: ConfigSavedInput): string {
    return `Конфигурация сохранена: ${this.gameMode(input.mode)}, ${this.playMode(input.playMode)}${
      input.pairingMode ? `, пары: ${this.pairingMode(input.pairingMode)}` : ""
    }.`;
  }

  manualPairPrompt(): string {
    return "Выберите игрока, которому загадываете слово:";
  }

  manualPairingCompleted(): string {
    return "Ручное распределение завершено. Переходим к вводу слов.";
  }

  allReadyGameStarts(): string {
    return "Все готовы. Игра начинается.";
  }

  waitForPairingCompletion(): string {
    return "Ожидайте завершения распределения пар.";
  }

  confirmWordPrompt(word: string): string {
    return `Подтвердите слово: \"${word}\"`;
  }

  yesButton(): string {
    return "Да";
  }

  noButton(): string {
    return "Нет";
  }

  reenterWordPrompt(): string {
    return "Введите слово заново:";
  }

  addCluePrompt(): string {
    return "Добавить пояснение к слову?";
  }

  enterCluePrompt(): string {
    return "Введите пояснение:";
  }

  restartWordPrompt(): string {
    return "Ок, заполним слово заново. Введите слово:";
  }

  readyWaitingOthers(): string {
    return "Готово. Ожидаем остальных игроков.";
  }

  enterWordPrompt(): string {
    return "Введите слово для игры:";
  }

  wordSummary(word: string | undefined, clue: string | undefined): string {
    return [`Слово: ${word ?? "-"}`, `Пояснение: ${clue ?? "(нет)"}`, "Подтвердить?"].join("\n");
  }

  confirmButton(): string {
    return "Подтвердить";
  }

  editButton(): string {
    return "Редактировать";
  }
}
