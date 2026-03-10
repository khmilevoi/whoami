import * as errore from "errore";
import { DomainAppError } from "../domain/errors";
import {
  GameMode,
  PairingMode,
  PlayMode,
  TurnRecord,
  VoteDecision,
} from "../domain/types";

export type SupportedLocale = "ru";

interface ConfigSavedInput {
  mode: GameMode;
  playMode: PlayMode;
  pairingMode?: PairingMode;
}

type VoteOutcome = TurnRecord["outcome"];

export class TextService {
  constructor(readonly locale: SupportedLocale) {}

  renderError(error: DomainAppError): string {
    return errore.matchError(error, {
      InvalidManualPairPayloadError: () => "Некорректные данные выбора пары",
      ActiveGameNotFoundByChatError: () =>
        "Активная игра в этом чате не найдена",
      GameNotFoundError: () => "Игра не найдена",
      PlayerNotFoundInGameError: () => "Игрок не найден в этой игре",
      ActiveGameAlreadyExistsInChatError: () =>
        "В этом чате уже идет активная игра. Завершите ее перед стартом новой.",
      GameConfigurationNotSetError: () => "Конфигурация игры не задана",
      GameConfigurationMissingError: () => "Конфигурация игры не задана",
      OnlyGameCreatorCanCancelError: () =>
        "Только создатель игры может отменить игру",
      UnknownGameModeError: (typedError) =>
        `Неизвестный режим игры: ${typedError.mode}`,
      OnlyGameCreatorCanConfigureError: () =>
        "Только создатель игры может настраивать режим",
      JoinAllowedOnlyWhenLobbyOpenError: () =>
        "Присоединиться можно только пока открыт набор игроков",
      MaxPlayersReachedError: (typedError) =>
        `Достигнут максимум игроков: ${typedError.maxPlayers}.`,
      LobbyAlreadyClosedError: () => "Набор игроков уже закрыт",
      OnlyGameCreatorCanCloseLobbyError: () =>
        "Только создатель игры может закрыть набор игроков",
      MinPlayersRequiredToStartError: (typedError) =>
        `Для старта нужно минимум ${typedError.minPlayers} игрока(ов).`,
      GameCanBeConfiguredOnlyAfterLobbyClosedError: () =>
        "Настраивать игру можно только после закрытия набора игроков",
      PairingModeRequiredForNormalModeError: () =>
        "Для обычного режима нужно выбрать распределение пар",
      ManualPairingAvailableOnlyForNormalManualModeError: () =>
        "Ручное распределение доступно только для обычного режима с ручным выбором пар",
      NotPlayersTurnToPickPairError: () =>
        "Сейчас не ход этого игрока для выбора пары",
      WordCannotBeEmptyError: () => "Слово не может быть пустым",
      WordMustBeSubmittedBeforeConfirmationError: () =>
        "Сначала нужно ввести слово",
      WordMustBeConfirmedBeforeClueSubmissionError: () =>
        "Сначала подтвердите слово, потом добавляйте пояснение",
      WordMustBeConfirmedBeforeFinalizationError: () =>
        "Сначала подтвердите слово",
      NotAllPlayersConfirmedWordsError: () => "Не все игроки подтвердили слова",
      PendingVoteMustBeResolvedFirstError: () =>
        "Сначала нужно завершить текущее голосование",
      QuestionTextRequiredInOnlineModeError: () =>
        "В онлайн-режиме нужно отправить текст вопроса",
      NotPlayersTurnError: () => "Сейчас не ход этого игрока",
      ReverseModeTargetMissingError: () =>
        "Не удалось определить игрока, чье слово сейчас угадывают",
      NoPendingVoteError: () => "Нет активного голосования",
      PlayerNotAllowedToVoteError: () =>
        "Этот игрок не может голосовать в текущем опросе",
      ReverseVoteTargetMissingError: () =>
        "Не удалось определить цель голосования в обратном режиме",
      NoActivePlayersLeftError: () => "Не осталось активных игроков",
      UnableToResolveCurrentAskerError: () =>
        "Не удалось определить текущего задающего вопрос",
      ReverseModeAskerMissingError: () =>
        "Не удалось определить текущего задающего вопрос в обратном режиме",
      WordActionsNotAvailableInCurrentStageError: () =>
        "Сейчас нельзя выполнять действия со словом",
      ExpectedStageMismatchError: (typedError) =>
        `Ожидался этап ${typedError.expectedStage}, получен ${typedError.actualStage}`,
      PlayerNotFoundError: () => "Игрок не найден",
      WordEntryForPlayerMissingError: () => "Для игрока не найдено слово",
      NeedAtLeastTwoPlayersForPairingsError: () =>
        "Для распределения пар нужно минимум два игрока",
      UnknownPlayerInManualPairingError: () =>
        "В ручном распределении указан неизвестный игрок",
      PlayerCannotPairWithSelfError: () =>
        "Нельзя назначить игрока самому себе",
      PlayerHasAlreadySelectedAPairError: () => "Игрок уже выбрал пару",
      SelectedTargetIsAlreadyTakenError: () => "Выбранный игрок уже занят",
      Error: () => this.genericErrorRetry(),
    });
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
    return [
      `Слово: ${word ?? "-"}`,
      `Пояснение: ${clue ?? "(нет)"}`,
      "Подтвердить?",
    ].join("\n");
  }

  confirmButton(): string {
    return "Подтвердить";
  }

  editButton(): string {
    return "Редактировать";
  }
}
