import { buildRandomDerangement, validateManualPairChoice } from "./pairing";
import { computeMajorityDecision } from "./rules";
import { buildGameResult } from "./stats";
import { DomainError } from "./errors";
import {
  ConfigureGameInput,
  GameState,
  LobbyLimits,
  PendingVote,
  PlayerIdentity,
  PlayerState,
  StartGameInput,
  VoteDecision,
  WordEntry,
} from "./types";

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
      createdAt: input.now,
      updatedAt: input.now,
    };
  }

  markDmOpened(game: GameState, playerId: string, now: string): GameState {
    const player = this.mustGetPlayer(game, playerId);
    player.dmOpened = true;
    if (player.stage === "BLOCKED_DM") {
      player.stage = "JOINED";
    }

    return this.touch(game, now);
  }

  markDmBlocked(game: GameState, playerId: string, now: string): GameState {
    const player = this.mustGetPlayer(game, playerId);
    if (player.stage !== "READY" && player.stage !== "GUESSED" && player.stage !== "GAVE_UP") {
      player.stage = "BLOCKED_DM";
    }

    return this.touch(game, now);
  }

  joinGame(game: GameState, player: PlayerIdentity, limits: LobbyLimits, now: string): GameState {
    if (game.stage !== "LOBBY_OPEN") {
      throw new DomainError("Join is allowed only while lobby is open");
    }

    const existing = game.players.find((p) => p.id === player.id || p.telegramUserId === player.telegramUserId);
    if (existing) {
      return this.touch(game, now);
    }

    if (game.players.length >= limits.maxPlayers) {
      throw new DomainError(`Maximum players reached (${limits.maxPlayers})`);
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

  closeLobby(game: GameState, actorPlayerId: string, limits: LobbyLimits, now: string): GameState {
    if (game.stage !== "LOBBY_OPEN") {
      throw new DomainError("Lobby already closed");
    }
    if (actorPlayerId !== game.creatorPlayerId) {
      throw new DomainError("Only game creator can close lobby");
    }
    if (game.players.length < limits.minPlayers) {
      throw new DomainError(`Need at least ${limits.minPlayers} players to start`);
    }

    game.stage = "CONFIGURING";
    return this.touch(game, now);
  }

  configureGame(game: GameState, input: ConfigureGameInput, now: string): GameState {
    if (game.stage !== "CONFIGURING") {
      throw new DomainError("Game can be configured only after lobby is closed");
    }
    if (input.actorPlayerId !== game.creatorPlayerId) {
      throw new DomainError("Only game creator can configure game");
    }

    if (input.mode === "NORMAL" && !input.pairingMode) {
      throw new DomainError("Pairing mode is required for normal mode");
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
      const ids = game.players.map((p) => p.id);
      if (input.pairingMode === "RANDOM") {
        game.pairings = buildRandomDerangement(ids);
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

  selectManualPair(game: GameState, chooserPlayerId: string, targetPlayerId: string, now: string): GameState {
    this.mustBeStage(game, "PREPARE_WORDS");
    if (!game.config || game.config.mode !== "NORMAL" || game.config.pairingMode !== "MANUAL") {
      throw new DomainError("Manual pairing is available only for normal/manual mode");
    }

    const queue = game.preparation.manualPairingQueue;
    const current = queue[game.preparation.manualPairingCursor];
    if (chooserPlayerId !== current) {
      throw new DomainError("It is not this player's turn to pick a pair");
    }

    validateManualPairChoice(chooserPlayerId, targetPlayerId, game.pairings, queue);

    game.pairings[chooserPlayerId] = targetPlayerId;
    game.preparation.manualPairingCursor += 1;

    if (game.preparation.manualPairingCursor >= queue.length) {
      game.words = this.initWordsForNormal(game.pairings);
    }

    return this.touch(game, now);
  }

  submitWord(game: GameState, playerId: string, word: string, now: string): GameState {
    this.mustBeWordStage(game);

    const normalized = word.trim();
    if (normalized.length < 1) {
      throw new DomainError("Word cannot be empty");
    }

    const entry = this.mustGetWordEntry(game, playerId);
    entry.word = normalized;
    entry.clue = undefined;
    entry.wordConfirmed = false;
    entry.finalConfirmed = false;

    const player = this.mustGetPlayer(game, playerId);
    player.stage = "WORD_DRAFT";

    return this.touch(game, now);
  }

  confirmWord(game: GameState, playerId: string, confirmed: boolean, now: string): GameState {
    this.mustBeWordStage(game);

    const entry = this.mustGetWordEntry(game, playerId);
    const player = this.mustGetPlayer(game, playerId);

    if (!confirmed) {
      entry.word = undefined;
      entry.clue = undefined;
      entry.wordConfirmed = false;
      entry.finalConfirmed = false;
      player.stage = "WORD_DRAFT";
      return this.touch(game, now);
    }

    if (!entry.word) {
      throw new DomainError("Word must be submitted before confirmation");
    }

    entry.wordConfirmed = true;
    player.stage = "WORD_CONFIRMED";

    return this.touch(game, now);
  }

  submitClue(game: GameState, playerId: string, clue: string | undefined, now: string): GameState {
    this.mustBeWordStage(game);

    const entry = this.mustGetWordEntry(game, playerId);
    if (!entry.wordConfirmed) {
      throw new DomainError("Word must be confirmed before clue submission");
    }

    entry.clue = clue?.trim() || undefined;
    return this.touch(game, now);
  }

  finalizeWord(game: GameState, playerId: string, confirmed: boolean, now: string): GameState {
    this.mustBeWordStage(game);

    const entry = this.mustGetWordEntry(game, playerId);
    const player = this.mustGetPlayer(game, playerId);

    if (!confirmed) {
      entry.word = undefined;
      entry.clue = undefined;
      entry.wordConfirmed = false;
      entry.finalConfirmed = false;
      player.stage = "WORD_DRAFT";
      return this.touch(game, now);
    }

    if (!entry.wordConfirmed) {
      throw new DomainError("Word must be confirmed before finalization");
    }

    entry.finalConfirmed = true;
    player.stage = "READY";

    if (this.allWordsReady(game)) {
      game.stage = "READY_WAIT";
    }

    return this.touch(game, now);
  }

  startGameIfReady(game: GameState, now: string): GameState {
    if (game.stage !== "READY_WAIT") {
      return this.touch(game, now);
    }

    if (!this.allWordsReady(game)) {
      throw new DomainError("Not all players confirmed words");
    }

    game.stage = "IN_PROGRESS";
    game.inProgress.round = 1;

    if (!game.config) {
      throw new DomainError("Game configuration is missing");
    }

    if (game.config.mode === "NORMAL") {
      game.inProgress.turnOrder = game.players.map((p) => p.id);
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

  askQuestion(game: GameState, input: AskQuestionInput): GameState {
    this.mustBeStage(game, "IN_PROGRESS");

    if (!game.config) {
      throw new DomainError("Game configuration is missing");
    }

    if (game.inProgress.pendingVote) {
      throw new DomainError("Pending vote must be resolved first");
    }

    if (game.config.playMode === "ONLINE" && !input.questionText?.trim()) {
      throw new DomainError("Question text is required in online mode");
    }

    const round = game.inProgress.round;
    const asker = this.resolveCurrentAsker(game);

    if (input.actorPlayerId !== asker) {
      throw new DomainError("It is not this player's turn");
    }

    game.progress[asker].questionsAsked += 1;
    game.progress[asker].roundsUsed = Math.max(game.progress[asker].roundsUsed, round);

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
        throw new DomainError("Reverse mode target is missing");
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

  castVote(game: GameState, input: CastVoteInput): GameState {
    this.mustBeStage(game, "IN_PROGRESS");

    const pending = game.inProgress.pendingVote;
    if (!pending) {
      throw new DomainError("No pending vote");
    }

    if (!pending.eligibleVoterIds.includes(input.voterPlayerId)) {
      throw new DomainError("Player is not allowed to vote in this poll");
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
      throw new DomainError("Game configuration is missing");
    }

    if (game.config.mode === "NORMAL") {
      this.resolveNormalVote(game, pending, input.turnRecordId, input.now);
    } else {
      this.resolveReverseVote(game, pending, input.turnRecordId, input.now);
    }

    game.inProgress.pendingVote = undefined;

    return this.touch(game, input.now);
  }

  giveUp(game: GameState, input: GiveUpInput): GameState {
    this.mustBeStage(game, "IN_PROGRESS");

    if (!game.config) {
      throw new DomainError("Game configuration is missing");
    }

    const round = game.inProgress.round;

    if (game.config.mode === "NORMAL") {
      const player = this.mustGetPlayer(game, input.playerId);
      if (terminalPlayerStages.has(player.stage)) {
        return this.touch(game, input.now);
      }

      player.stage = "GAVE_UP";
      game.progress[input.playerId].gaveUpAtRound = round;
      game.progress[input.playerId].roundsUsed = Math.max(game.progress[input.playerId].roundsUsed, round);

      game.turns.push({
        id: input.turnRecordId,
        round,
        askerPlayerId: input.playerId,
        outcome: "GIVEUP",
        createdAt: input.now,
      });

      if (this.allNormalPlayersFinished(game)) {
        game.stage = "FINISHED";
        game.result = buildGameResult(game, input.now);
        return this.touch(game, input.now);
      }

      if (!game.inProgress.pendingVote && this.resolveCurrentAsker(game) === input.playerId) {
        this.advanceNormalTurn(game);
      }

      return this.touch(game, input.now);
    }

    const targetId = game.inProgress.currentTargetPlayerId;
    if (!targetId || input.playerId === targetId) {
      return this.touch(game, input.now);
    }

    const progress = game.progress[input.playerId];
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

    if (!game.inProgress.pendingVote && this.resolveCurrentAsker(game) === input.playerId) {
      this.advanceReverseTurn(game, input.playerId);
    }

    this.ensureReverseProgress(game, input.now);

    return this.touch(game, input.now);
  }

  cancelGame(game: GameState, reason: string, now: string): GameState {
    game.stage = "CANCELED";
    game.canceledReason = reason;
    return this.touch(game, now);
  }

  private resolveNormalVote(game: GameState, pending: PendingVote, turnRecordId: string, now: string): void {
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
      player.stage = "GUESSED";
      game.progress[pending.askerPlayerId].guessedAtRound = pending.round;
      game.progress[pending.askerPlayerId].roundsUsed = Math.max(game.progress[pending.askerPlayerId].roundsUsed, pending.round);
      this.advanceNormalTurn(game);
    } else if (outcome === "NO") {
      this.advanceNormalTurn(game);
    }

    if (this.allNormalPlayersFinished(game)) {
      game.stage = "FINISHED";
      game.result = buildGameResult(game, now);
    }
  }

  private resolveReverseVote(game: GameState, pending: PendingVote, turnRecordId: string, now: string): void {
    const targetId = pending.targetWordOwnerId;
    if (!targetId) {
      throw new DomainError("Reverse vote target is missing");
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
      this.ensureReverseProgress(game, now);
      return;
    }

    this.advanceReverseTurn(game, pending.askerPlayerId);
    this.ensureReverseProgress(game, now);
  }

  private ensureReverseProgress(game: GameState, now: string): void {
    if (!game.inProgress.currentTargetPlayerId) {
      game.stage = "FINISHED";
      game.result = buildGameResult(game, now);
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
      game.result = buildGameResult(game, now);
    }
  }

  private resolveCurrentAsker(game: GameState): string {
    if (!game.config) {
      throw new DomainError("Game configuration is missing");
    }

    if (game.config.mode === "NORMAL") {
      const active = new Set(this.getActiveNormalPlayers(game));
      if (active.size === 0) {
        throw new DomainError("No active players left");
      }

      let guard = 0;
      while (guard < game.inProgress.turnOrder.length + 1) {
        const playerId = game.inProgress.turnOrder[game.inProgress.turnCursor];
        if (active.has(playerId)) {
          return playerId;
        }
        this.advanceNormalTurn(game);
        guard += 1;
      }

      throw new DomainError("Unable to resolve current asker");
    }

    const current = game.inProgress.turnOrder[game.inProgress.turnCursor];
    if (!current) {
      throw new DomainError("Reverse mode asker is missing");
    }

    return current;
  }

  private getNormalEligibleVoters(game: GameState, askerPlayerId: string): string[] {
    return game.players.filter((player) => player.id !== askerPlayerId && player.stage !== "GAVE_UP").map((player) => player.id);
  }

  private getActiveNormalPlayers(game: GameState): string[] {
    return game.players.filter((player) => !terminalPlayerStages.has(player.stage)).map((player) => player.id);
  }

  private allNormalPlayersFinished(game: GameState): boolean {
    return game.players.every((player) => terminalPlayerStages.has(player.stage));
  }

  private advanceNormalTurn(game: GameState): void {
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
      const player = this.mustGetPlayer(game, candidate);
      if (!terminalPlayerStages.has(player.stage)) {
        return;
      }

      iterations += 1;
    }
  }

  private getReverseGuessers(game: GameState, targetPlayerId: string): string[] {
    return game.players
      .map((p) => p.id)
      .filter((playerId) => playerId !== targetPlayerId)
      .filter((playerId) => !game.progress[playerId].reverseGiveUpsByTarget.includes(targetPlayerId));
  }

  private rebuildReverseTurnOrder(game: GameState, previousAskerId?: string): void {
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
    const ids = game.players.map((p) => p.id);
    if (ids.length === 0) {
      game.inProgress.currentTargetPlayerId = undefined;
      return;
    }

    let nextCursor = game.inProgress.targetCursor;
    let checked = 0;

    while (checked < ids.length) {
      nextCursor = (nextCursor + 1) % ids.length;
      const candidate = ids[nextCursor];
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

  private initWordsForNormal(pairings: Record<string, string>): Record<string, WordEntry> {
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

    return wordEntries.every((entry) => Boolean(entry.word && entry.wordConfirmed && entry.finalConfirmed));
  }

  private mustBeWordStage(game: GameState): void {
    if (game.stage !== "PREPARE_WORDS" && game.stage !== "READY_WAIT") {
      throw new DomainError("Word actions are not available in current stage");
    }
  }

  private mustBeStage(game: GameState, stage: GameState["stage"]): void {
    if (game.stage !== stage) {
      throw new DomainError(`Expected stage ${stage}, got ${game.stage}`);
    }
  }

  private mustGetPlayer(game: GameState, playerId: string): PlayerState {
    const player = game.players.find((p) => p.id === playerId);
    if (!player) {
      throw new DomainError("Player not found");
    }
    return player;
  }

  private mustGetWordEntry(game: GameState, playerId: string): WordEntry {
    const entry = game.words[playerId];
    if (!entry) {
      throw new DomainError("Word entry for player is missing");
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

