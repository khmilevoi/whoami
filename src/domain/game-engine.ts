import * as appErrors from "./errors.js";
import { buildRandomDerangement, validateManualPairChoice } from "./pairing.js";
import { computeMajorityDecision } from "./rules.js";
import { buildGameResult } from "./stats.js";
import {
  ConfigureGameInput,
  GameState,
  LobbyLimits,
  PendingVote,
  PlayerIdentity,
  PlayerProgress,
  PlayerState,
  StartGameInput,
  VoteDecision,
  WordEntry,
} from "./types.js";

interface AskQuestionInput {
  actorPlayerId: string;
  questionText?: string;
  voteId: string;
  now: string;
}

interface CastVoteInput {
  voterPlayerId: string;
  decision: VoteDecision;
  voteRecordId: string;
  turnRecordId: string;
  now: string;
}

interface GiveUpInput {
  playerId: string;
  turnRecordId: string;
  now: string;
}

const terminalPlayerStages = new Set(["GUESSED", "GAVE_UP"]);

export class GameEngine {
  createGame(input: StartGameInput): GameState {
    const creator = this.toPlayerState(input.creator, input.now);

    return {
      id: input.gameId,
      chatId: input.chatId,
      creatorPlayerId: creator.id,
      creatorTelegramUserId: creator.telegramUserId,
      stage: "LOBBY_OPEN",
      players: [creator],
      pairings: {},
      words: {},
      preparation: {
        manualPairingQueue: [],
        manualPairingCursor: 0,
      },
      inProgress: {
        round: 0,
        turnOrder: [],
        turnCursor: 0,
        targetCursor: 0,
      },
      progress: {
        [creator.id]: {
          playerId: creator.id,
          questionsAsked: 0,
          roundsUsed: 0,
          reverseGiveUpsByTarget: [],
        },
      },
      turns: [],
      voteHistory: [],
      ui: {
        privatePanels: {},
      },
      createdAt: input.now,
      updatedAt: input.now,
    };
  }

  markDmOpened(game: GameState, playerId: string, now: string) {
    const player = this.mustGetPlayer(game, playerId);
    if (player instanceof Error) return player;

    player.dmOpened = true;
    if (player.stage === "BLOCKED_DM") {
      player.stage = "JOINED";
    }

    return this.touch(game, now);
  }

  markDmBlocked(game: GameState, playerId: string, now: string) {
    const player = this.mustGetPlayer(game, playerId);
    if (player instanceof Error) return player;

    if (
      player.stage !== "READY" &&
      player.stage !== "GUESSED" &&
      player.stage !== "GAVE_UP"
    ) {
      player.stage = "BLOCKED_DM";
    }

    return this.touch(game, now);
  }

  joinGame(
    game: GameState,
    player: PlayerIdentity,
    limits: LobbyLimits,
    now: string,
  ) {
    if (game.stage !== "LOBBY_OPEN") {
      return new appErrors.JoinAllowedOnlyWhenLobbyOpenError();
    }

    const existing = game.players.find(
      (candidate) =>
        candidate.id === player.id ||
        candidate.telegramUserId === player.telegramUserId,
    );
    if (existing) {
      return this.touch(game, now);
    }

    if (game.players.length >= limits.maxPlayers) {
      return new appErrors.MaxPlayersReachedError({
        maxPlayers: limits.maxPlayers,
      });
    }

    const next = this.toPlayerState(player, now);
    game.players.push(next);
    game.progress[next.id] = {
      playerId: next.id,
      questionsAsked: 0,
      roundsUsed: 0,
      reverseGiveUpsByTarget: [],
    };

    return this.touch(game, now);
  }

  closeLobby(
    game: GameState,
    actorPlayerId: string,
    limits: LobbyLimits,
    now: string,
  ) {
    if (game.stage !== "LOBBY_OPEN") {
      return new appErrors.LobbyAlreadyClosedError();
    }
    if (actorPlayerId !== game.creatorPlayerId) {
      return new appErrors.OnlyGameCreatorCanCloseLobbyError();
    }
    if (game.players.length < limits.minPlayers) {
      return new appErrors.MinPlayersRequiredToStartError({
        minPlayers: limits.minPlayers,
      });
    }

    game.stage = "CONFIGURING";
    return this.touch(game, now);
  }

  configureGame(game: GameState, input: ConfigureGameInput, now: string) {
    if (game.stage !== "CONFIGURING") {
      return new appErrors.GameCanBeConfiguredOnlyAfterLobbyClosedError();
    }
    if (input.actorPlayerId !== game.creatorPlayerId) {
      return new appErrors.OnlyGameCreatorCanConfigureError();
    }
    if (input.mode === "NORMAL" && !input.pairingMode) {
      return new appErrors.PairingModeRequiredForNormalModeError();
    }

    game.config = {
      mode: input.mode,
      playMode: input.playMode,
      pairingMode: input.pairingMode,
    };

    for (const player of game.players) {
      player.stage = "WORD_DRAFT";
    }

    game.stage = "PREPARE_WORDS";
    game.pairings = {};
    game.words = {};

    if (input.mode === "NORMAL") {
      const ids = game.players.map((player) => player.id);
      if (input.pairingMode === "RANDOM") {
        const pairings = buildRandomDerangement(ids);
        if (pairings instanceof Error) return pairings;
        game.pairings = pairings;
        game.words = this.initWordsForNormal(game.pairings);
      } else {
        game.preparation.manualPairingQueue = ids;
        game.preparation.manualPairingCursor = 0;
      }
    } else {
      for (const player of game.players) {
        game.words[player.id] = {
          ownerPlayerId: player.id,
          targetPlayerId: player.id,
          wordConfirmed: false,
          finalConfirmed: false,
          solved: false,
        };
      }
    }

    return this.touch(game, now);
  }

  selectManualPair(
    game: GameState,
    chooserPlayerId: string,
    targetPlayerId: string,
    now: string,
  ) {
    const stageError = this.mustBeStage(game, "PREPARE_WORDS");
    if (stageError instanceof Error) return stageError;

    if (
      !game.config ||
      game.config.mode !== "NORMAL" ||
      game.config.pairingMode !== "MANUAL"
    ) {
      return new appErrors.ManualPairingAvailableOnlyForNormalManualModeError();
    }

    const queue = game.preparation.manualPairingQueue;
    const current = queue[game.preparation.manualPairingCursor];
    if (chooserPlayerId !== current) {
      return new appErrors.NotPlayersTurnToPickPairError();
    }

    const validationError = validateManualPairChoice(
      chooserPlayerId,
      targetPlayerId,
      game.pairings,
      queue,
    );
    if (validationError instanceof Error) return validationError;

    game.pairings[chooserPlayerId] = targetPlayerId;
    game.preparation.manualPairingCursor += 1;

    if (game.preparation.manualPairingCursor >= queue.length) {
      game.words = this.initWordsForNormal(game.pairings);
    }

    return this.touch(game, now);
  }

  submitWord(game: GameState, playerId: string, word: string, now: string) {
    const stageError = this.mustBeWordStage(game);
    if (stageError instanceof Error) return stageError;

    const normalized = word.trim();
    if (normalized.length < 1) {
      return new appErrors.WordCannotBeEmptyError();
    }

    const entry = this.mustGetWordEntry(game, playerId);
    if (entry instanceof Error) return entry;

    entry.word = normalized;
    entry.clue = undefined;
    entry.wordConfirmed = false;
    entry.finalConfirmed = false;

    const player = this.mustGetPlayer(game, playerId);
    if (player instanceof Error) return player;

    player.stage = "WORD_DRAFT";
    return this.touch(game, now);
  }

  confirmWord(
    game: GameState,
    playerId: string,
    confirmed: boolean,
    now: string,
  ) {
    const stageError = this.mustBeWordStage(game);
    if (stageError instanceof Error) return stageError;

    const entry = this.mustGetWordEntry(game, playerId);
    if (entry instanceof Error) return entry;

    const player = this.mustGetPlayer(game, playerId);
    if (player instanceof Error) return player;

    if (!confirmed) {
      entry.word = undefined;
      entry.clue = undefined;
      entry.wordConfirmed = false;
      entry.finalConfirmed = false;
      player.stage = "WORD_DRAFT";
      return this.touch(game, now);
    }

    if (!entry.word) {
      return new appErrors.WordMustBeSubmittedBeforeConfirmationError();
    }

    entry.wordConfirmed = true;
    player.stage = "WORD_CONFIRMED";
    return this.touch(game, now);
  }

  submitClue(
    game: GameState,
    playerId: string,
    clue: string | undefined,
    now: string,
  ) {
    const stageError = this.mustBeWordStage(game);
    if (stageError instanceof Error) return stageError;

    const entry = this.mustGetWordEntry(game, playerId);
    if (entry instanceof Error) return entry;

    if (!entry.wordConfirmed) {
      return new appErrors.WordMustBeConfirmedBeforeClueSubmissionError();
    }

    entry.clue = clue?.trim() || undefined;
    return this.touch(game, now);
  }

  finalizeWord(
    game: GameState,
    playerId: string,
    confirmed: boolean,
    now: string,
  ) {
    const stageError = this.mustBeWordStage(game);
    if (stageError instanceof Error) return stageError;

    const entry = this.mustGetWordEntry(game, playerId);
    if (entry instanceof Error) return entry;

    const player = this.mustGetPlayer(game, playerId);
    if (player instanceof Error) return player;

    if (!confirmed) {
      entry.word = undefined;
      entry.clue = undefined;
      entry.wordConfirmed = false;
      entry.finalConfirmed = false;
      player.stage = "WORD_DRAFT";
      return this.touch(game, now);
    }

    if (!entry.wordConfirmed) {
      return new appErrors.WordMustBeConfirmedBeforeFinalizationError();
    }

    entry.finalConfirmed = true;
    player.stage = "READY";

    if (this.allWordsReady(game)) {
      game.stage = "READY_WAIT";
    }

    return this.touch(game, now);
  }

  startGameIfReady(game: GameState, now: string) {
    if (game.stage !== "READY_WAIT") {
      return this.touch(game, now);
    }

    if (!this.allWordsReady(game)) {
      return new appErrors.NotAllPlayersConfirmedWordsError();
    }

    game.stage = "IN_PROGRESS";
    game.inProgress.round = 1;

    if (!game.config) {
      return new appErrors.GameConfigurationMissingError();
    }

    if (game.config.mode === "NORMAL") {
      game.inProgress.turnOrder = game.players.map((player) => player.id);
      game.inProgress.turnCursor = 0;
      game.inProgress.currentTargetPlayerId = undefined;
      game.inProgress.targetCursor = 0;
    } else {
      game.inProgress.turnOrder = [];
      game.inProgress.turnCursor = 0;
      game.inProgress.targetCursor = 0;
      game.inProgress.currentTargetPlayerId = game.players[0]?.id;
      this.rebuildReverseTurnOrder(game, undefined);
    }

    return this.touch(game, now);
  }

  askQuestion(game: GameState, input: AskQuestionInput) {
    const stageError = this.mustBeStage(game, "IN_PROGRESS");
    if (stageError instanceof Error) return stageError;

    if (!game.config) {
      return new appErrors.GameConfigurationMissingError();
    }

    if (game.inProgress.pendingVote) {
      return new appErrors.PendingVoteMustBeResolvedFirstError();
    }

    if (game.config.playMode === "ONLINE" && !input.questionText?.trim()) {
      return new appErrors.QuestionTextRequiredInOnlineModeError();
    }

    const round = game.inProgress.round;
    const asker = this.resolveCurrentAsker(game);
    if (asker instanceof Error) return asker;

    if (input.actorPlayerId !== asker) {
      return new appErrors.NotPlayersTurnError();
    }

    const askerProgress = this.mustGetProgress(game, asker);
    if (askerProgress instanceof Error) return askerProgress;

    askerProgress.questionsAsked += 1;
    askerProgress.roundsUsed = Math.max(askerProgress.roundsUsed, round);

    if (game.config.mode === "NORMAL") {
      const eligible = this.getNormalEligibleVoters(game, asker);
      game.inProgress.pendingVote = {
        id: input.voteId,
        gameId: game.id,
        round,
        askerPlayerId: asker,
        questionText: input.questionText,
        eligibleVoterIds: eligible,
        votes: {},
        createdAt: input.now,
      };
    } else {
      const targetId = game.inProgress.currentTargetPlayerId;
      if (!targetId) {
        return new appErrors.ReverseModeTargetMissingError();
      }
      game.inProgress.pendingVote = {
        id: input.voteId,
        gameId: game.id,
        round,
        askerPlayerId: asker,
        targetWordOwnerId: targetId,
        questionText: input.questionText,
        eligibleVoterIds: [targetId],
        votes: {},
        createdAt: input.now,
      };
    }

    return this.touch(game, input.now);
  }

  castVote(game: GameState, input: CastVoteInput) {
    const stageError = this.mustBeStage(game, "IN_PROGRESS");
    if (stageError instanceof Error) return stageError;

    const pending = game.inProgress.pendingVote;
    if (!pending) {
      return new appErrors.NoPendingVoteError();
    }

    if (!pending.eligibleVoterIds.includes(input.voterPlayerId)) {
      return new appErrors.PlayerNotAllowedToVoteError();
    }

    if (pending.votes[input.voterPlayerId]) {
      return this.touch(game, input.now);
    }

    pending.votes[input.voterPlayerId] = input.decision;
    game.voteHistory.push({
      id: input.voteRecordId,
      pendingVoteId: pending.id,
      voterPlayerId: input.voterPlayerId,
      decision: input.decision,
      createdAt: input.now,
    });

    if (Object.keys(pending.votes).length < pending.eligibleVoterIds.length) {
      return this.touch(game, input.now);
    }

    if (!game.config) {
      return new appErrors.GameConfigurationMissingError();
    }

    const resolutionError =
      game.config.mode === "NORMAL"
        ? this.resolveNormalVote(game, pending, input.turnRecordId, input.now)
        : this.resolveReverseVote(game, pending, input.turnRecordId, input.now);
    if (resolutionError instanceof Error) return resolutionError;

    game.inProgress.pendingVote = undefined;
    return this.touch(game, input.now);
  }

  giveUp(game: GameState, input: GiveUpInput) {
    const stageError = this.mustBeStage(game, "IN_PROGRESS");
    if (stageError instanceof Error) return stageError;

    if (!game.config) {
      return new appErrors.GameConfigurationMissingError();
    }

    const round = game.inProgress.round;

    if (game.config.mode === "NORMAL") {
      const player = this.mustGetPlayer(game, input.playerId);
      if (player instanceof Error) return player;

      if (terminalPlayerStages.has(player.stage)) {
        return this.touch(game, input.now);
      }

      const progress = this.mustGetProgress(game, input.playerId);
      if (progress instanceof Error) return progress;

      player.stage = "GAVE_UP";
      progress.gaveUpAtRound = round;
      progress.roundsUsed = Math.max(progress.roundsUsed, round);

      game.turns.push({
        id: input.turnRecordId,
        round,
        askerPlayerId: input.playerId,
        outcome: "GIVEUP",
        createdAt: input.now,
      });

      if (this.allNormalPlayersFinished(game)) {
        game.stage = "FINISHED";
        const result = buildGameResult(game, input.now);
        if (result instanceof Error) return result;
        game.result = result;
        return this.touch(game, input.now);
      }

      const currentAsker = this.resolveCurrentAsker(game);
      if (currentAsker instanceof Error) return currentAsker;

      if (!game.inProgress.pendingVote && currentAsker === input.playerId) {
        const advanceError = this.advanceNormalTurn(game);
        if (advanceError instanceof Error) return advanceError;
      }

      return this.touch(game, input.now);
    }

    const targetId = game.inProgress.currentTargetPlayerId;
    if (!targetId || input.playerId === targetId) {
      return this.touch(game, input.now);
    }

    const progress = this.mustGetProgress(game, input.playerId);
    if (progress instanceof Error) return progress;

    if (progress.reverseGiveUpsByTarget.includes(targetId)) {
      return this.touch(game, input.now);
    }

    progress.reverseGiveUpsByTarget.push(targetId);

    game.turns.push({
      id: input.turnRecordId,
      round,
      askerPlayerId: input.playerId,
      targetWordOwnerId: targetId,
      outcome: "GIVEUP",
      createdAt: input.now,
    });

    const currentAsker = this.resolveCurrentAsker(game);
    if (currentAsker instanceof Error) return currentAsker;

    if (!game.inProgress.pendingVote && currentAsker === input.playerId) {
      this.advanceReverseTurn(game, input.playerId);
    }

    const progressError = this.ensureReverseProgress(game, input.now);
    if (progressError instanceof Error) return progressError;

    return this.touch(game, input.now);
  }

  cancelGame(game: GameState, reason: string, now: string) {
    game.stage = "CANCELED";
    game.canceledReason = reason;
    return this.touch(game, now);
  }

  private resolveNormalVote(
    game: GameState,
    pending: PendingVote,
    turnRecordId: string,
    now: string,
  ) {
    const outcome = computeMajorityDecision(Object.values(pending.votes));

    game.turns.push({
      id: turnRecordId,
      round: pending.round,
      askerPlayerId: pending.askerPlayerId,
      questionText: pending.questionText,
      outcome,
      createdAt: now,
    });

    if (outcome === "GUESSED") {
      const player = this.mustGetPlayer(game, pending.askerPlayerId);
      if (player instanceof Error) return player;

      const progress = this.mustGetProgress(game, pending.askerPlayerId);
      if (progress instanceof Error) return progress;

      player.stage = "GUESSED";
      progress.guessedAtRound = pending.round;
      progress.roundsUsed = Math.max(progress.roundsUsed, pending.round);
      const advanceError = this.advanceNormalTurn(game);
      if (advanceError instanceof Error) return advanceError;
    } else if (outcome === "NO") {
      const advanceError = this.advanceNormalTurn(game);
      if (advanceError instanceof Error) return advanceError;
    }

    if (this.allNormalPlayersFinished(game)) {
      game.stage = "FINISHED";
      const result = buildGameResult(game, now);
      if (result instanceof Error) return result;
      game.result = result;
    }

    return;
  }

  private resolveReverseVote(
    game: GameState,
    pending: PendingVote,
    turnRecordId: string,
    now: string,
  ) {
    const targetId = pending.targetWordOwnerId;
    if (!targetId) {
      return new appErrors.ReverseVoteTargetMissingError();
    }

    const targetDecision = pending.votes[targetId] ?? "NO";

    game.turns.push({
      id: turnRecordId,
      round: pending.round,
      askerPlayerId: pending.askerPlayerId,
      targetWordOwnerId: targetId,
      questionText: pending.questionText,
      outcome: targetDecision,
      createdAt: now,
    });

    if (targetDecision === "YES") {
      return;
    }

    if (targetDecision === "GUESSED") {
      const word = game.words[targetId];
      if (word) {
        word.solved = true;
      }
      this.advanceReverseTarget(game);
      return this.ensureReverseProgress(game, now);
    }

    this.advanceReverseTurn(game, pending.askerPlayerId);
    return this.ensureReverseProgress(game, now);
  }

  private ensureReverseProgress(game: GameState, now: string) {
    if (!game.inProgress.currentTargetPlayerId) {
      game.stage = "FINISHED";
      const result = buildGameResult(game, now);
      if (result instanceof Error) return result;
      game.result = result;
      return;
    }

    const targetId = game.inProgress.currentTargetPlayerId;
    const availableGuessers = this.getReverseGuessers(game, targetId);
    if (availableGuessers.length > 0) {
      return;
    }

    const word = game.words[targetId];
    if (word) {
      word.solved = true;
    }

    this.advanceReverseTarget(game);

    if (!game.inProgress.currentTargetPlayerId) {
      game.stage = "FINISHED";
      const result = buildGameResult(game, now);
      if (result instanceof Error) return result;
      game.result = result;
    }

    return;
  }

  private resolveCurrentAsker(game: GameState) {
    if (!game.config) {
      return new appErrors.GameConfigurationMissingError();
    }

    if (game.config.mode === "NORMAL") {
      const active = new Set(this.getActiveNormalPlayers(game));
      if (active.size === 0) {
        return new appErrors.NoActivePlayersLeftError();
      }

      let guard = 0;
      while (guard < game.inProgress.turnOrder.length + 1) {
        const playerId = game.inProgress.turnOrder[game.inProgress.turnCursor];
        if (!playerId) {
          return new appErrors.UnableToResolveCurrentAskerError();
        }

        if (active.has(playerId)) {
          return playerId;
        }

        const advanceError = this.advanceNormalTurn(game);
        if (advanceError instanceof Error) return advanceError;
        guard += 1;
      }

      return new appErrors.UnableToResolveCurrentAskerError();
    }

    const current = game.inProgress.turnOrder[game.inProgress.turnCursor];
    if (!current) {
      return new appErrors.ReverseModeAskerMissingError();
    }

    return current;
  }

  private getNormalEligibleVoters(
    game: GameState,
    askerPlayerId: string,
  ): string[] {
    return game.players
      .filter(
        (player) => player.id !== askerPlayerId && player.stage !== "GAVE_UP",
      )
      .map((player) => player.id);
  }

  private getActiveNormalPlayers(game: GameState): string[] {
    return game.players
      .filter((player) => !terminalPlayerStages.has(player.stage))
      .map((player) => player.id);
  }

  private allNormalPlayersFinished(game: GameState): boolean {
    return game.players.every((player) =>
      terminalPlayerStages.has(player.stage),
    );
  }

  private advanceNormalTurn(game: GameState) {
    const turnOrder = game.inProgress.turnOrder;
    if (turnOrder.length === 0) {
      return;
    }

    let iterations = 0;
    while (iterations <= turnOrder.length) {
      const previous = game.inProgress.turnCursor;
      const next = (previous + 1) % turnOrder.length;
      game.inProgress.turnCursor = next;
      if (next < previous) {
        game.inProgress.round += 1;
      }

      const candidate = turnOrder[next];
      if (!candidate) {
        return new appErrors.UnableToResolveCurrentAskerError();
      }

      const player = this.mustGetPlayer(game, candidate);
      if (player instanceof Error) return player;
      if (!terminalPlayerStages.has(player.stage)) {
        return;
      }

      iterations += 1;
    }

    return;
  }

  private getReverseGuessers(
    game: GameState,
    targetPlayerId: string,
  ): string[] {
    return game.players
      .map((player) => player.id)
      .filter((playerId) => playerId !== targetPlayerId)
      .filter((playerId) => {
        const progress = game.progress[playerId];
        return progress
          ? !progress.reverseGiveUpsByTarget.includes(targetPlayerId)
          : false;
      });
  }

  private rebuildReverseTurnOrder(
    game: GameState,
    previousAskerId?: string,
  ): void {
    const target = game.inProgress.currentTargetPlayerId;
    if (!target) {
      game.inProgress.turnOrder = [];
      game.inProgress.turnCursor = 0;
      return;
    }

    const guessers = this.getReverseGuessers(game, target);
    game.inProgress.turnOrder = guessers;
    if (guessers.length === 0) {
      game.inProgress.turnCursor = 0;
      return;
    }

    if (!previousAskerId) {
      game.inProgress.turnCursor = 0;
      return;
    }

    const index = guessers.indexOf(previousAskerId);
    game.inProgress.turnCursor = index >= 0 ? index : 0;
  }

  private advanceReverseTurn(game: GameState, previousAskerId: string): void {
    const target = game.inProgress.currentTargetPlayerId;
    if (!target) {
      return;
    }

    const guessers = this.getReverseGuessers(game, target);
    if (guessers.length === 0) {
      game.inProgress.turnOrder = [];
      game.inProgress.turnCursor = 0;
      this.advanceReverseTarget(game);
      return;
    }

    const index = guessers.indexOf(previousAskerId);
    let nextIndex = 0;

    if (index >= 0) {
      nextIndex = (index + 1) % guessers.length;
      if (nextIndex <= index) {
        game.inProgress.round += 1;
      }
    }

    game.inProgress.turnOrder = guessers;
    game.inProgress.turnCursor = nextIndex;
  }

  private advanceReverseTarget(game: GameState): void {
    const ids = game.players.map((player) => player.id);
    if (ids.length === 0) {
      game.inProgress.currentTargetPlayerId = undefined;
      return;
    }

    let nextCursor = game.inProgress.targetCursor;
    let checked = 0;

    while (checked < ids.length) {
      nextCursor = (nextCursor + 1) % ids.length;
      const candidate = ids[nextCursor];
      if (candidate === undefined) {
        break;
      }

      if (!game.words[candidate]?.solved) {
        game.inProgress.targetCursor = nextCursor;
        game.inProgress.currentTargetPlayerId = candidate;
        game.inProgress.turnOrder = this.getReverseGuessers(game, candidate);
        game.inProgress.turnCursor = 0;
        if (nextCursor === 0) {
          game.inProgress.round += 1;
        }
        return;
      }
      checked += 1;
    }

    game.inProgress.currentTargetPlayerId = undefined;
    game.inProgress.turnOrder = [];
    game.inProgress.turnCursor = 0;
  }

  private initWordsForNormal(
    pairings: Record<string, string>,
  ): Record<string, WordEntry> {
    const words: Record<string, WordEntry> = {};

    for (const [owner, target] of Object.entries(pairings)) {
      words[owner] = {
        ownerPlayerId: owner,
        targetPlayerId: target,
        wordConfirmed: false,
        finalConfirmed: false,
        solved: false,
      };
    }

    return words;
  }

  private allWordsReady(game: GameState): boolean {
    const wordEntries = Object.values(game.words);
    if (wordEntries.length !== game.players.length) {
      return false;
    }

    return wordEntries.every((entry) =>
      Boolean(entry.word && entry.wordConfirmed && entry.finalConfirmed),
    );
  }

  private mustBeWordStage(game: GameState) {
    if (game.stage !== "PREPARE_WORDS" && game.stage !== "READY_WAIT") {
      return new appErrors.WordActionsNotAvailableInCurrentStageError();
    }

    return;
  }

  private mustBeStage(game: GameState, stage: GameState["stage"]) {
    if (game.stage !== stage) {
      return new appErrors.ExpectedStageMismatchError({
        expectedStage: stage,
        actualStage: game.stage,
      });
    }

    return;
  }

  private mustGetPlayer(game: GameState, playerId: string) {
    const player = game.players.find((candidate) => candidate.id === playerId);
    if (!player) {
      return new appErrors.PlayerNotFoundError();
    }
    return player;
  }

  private mustGetProgress(
    game: GameState,
    playerId: string,
  ): PlayerProgress | appErrors.PlayerNotFoundError {
    const progress = game.progress[playerId];
    if (!progress) {
      return new appErrors.PlayerNotFoundError();
    }

    return progress;
  }

  private mustGetWordEntry(game: GameState, playerId: string) {
    const entry = game.words[playerId];
    if (!entry) {
      return new appErrors.WordEntryForPlayerMissingError();
    }

    return entry;
  }

  private toPlayerState(player: PlayerIdentity, now: string): PlayerState {
    return {
      id: player.id,
      telegramUserId: player.telegramUserId,
      username: player.username,
      displayName: player.displayName,
      stage: "JOINED",
      dmOpened: false,
      joinedAt: now,
    };
  }

  private touch(game: GameState, now: string): GameState {
    game.updatedAt = now;
    return game;
  }
}



