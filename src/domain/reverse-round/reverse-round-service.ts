import * as appErrors from "../errors.js";
import { AskQuestionInput, CastVoteInput, GiveUpInput } from "../round-action-input/index.js";
import { GameStateAccessPort } from "../game-state-access/index.js";
import { ReverseRoundPort } from "./reverse-round-port.js";
import { GameState, PendingVote } from "../types.js";

export class ReverseRoundService implements ReverseRoundPort {
  constructor(private readonly state: GameStateAccessPort) {}

  askQuestion(game: GameState, input: AskQuestionInput) {
    const stageError = this.state.mustBeStage(game, "IN_PROGRESS");
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

    const asker = this.resolveCurrentAsker(game);
    if (asker instanceof Error) return asker;

    if (input.actorPlayerId !== asker) {
      return new appErrors.NotPlayersTurnError();
    }

    const askerProgress = this.state.mustGetProgress(game, asker);
    if (askerProgress instanceof Error) return askerProgress;

    askerProgress.questionsAsked += 1;
    askerProgress.roundsUsed = Math.max(
      askerProgress.roundsUsed,
      game.inProgress.round,
    );

    const targetId = game.inProgress.currentTargetPlayerId;
    if (!targetId) {
      return new appErrors.ReverseModeTargetMissingError();
    }

    game.inProgress.pendingVote = {
      id: input.voteId,
      gameId: game.id,
      round: game.inProgress.round,
      askerPlayerId: asker,
      targetWordOwnerId: targetId,
      questionText: input.questionText,
      eligibleVoterIds: [targetId],
      votes: {},
      createdAt: input.now,
    };

    return this.state.touch(game, input.now);
  }

  castVote(game: GameState, input: CastVoteInput) {
    const stageError = this.state.mustBeStage(game, "IN_PROGRESS");
    if (stageError instanceof Error) return stageError;

    const pending = game.inProgress.pendingVote;
    if (!pending) {
      return new appErrors.NoPendingVoteError();
    }

    if (!pending.eligibleVoterIds.includes(input.voterPlayerId)) {
      return new appErrors.PlayerNotAllowedToVoteError();
    }

    if (pending.votes[input.voterPlayerId]) {
      return this.state.touch(game, input.now);
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
      return this.state.touch(game, input.now);
    }

    const resolutionError = this.resolveVote(
      game,
      pending,
      input.turnRecordId,
      input.now,
    );
    if (resolutionError instanceof Error) return resolutionError;

    game.inProgress.pendingVote = undefined;
    return this.state.touch(game, input.now);
  }

  giveUp(game: GameState, input: GiveUpInput) {
    const stageError = this.state.mustBeStage(game, "IN_PROGRESS");
    if (stageError instanceof Error) return stageError;

    if (!game.config) {
      return new appErrors.GameConfigurationMissingError();
    }

    const targetId = game.inProgress.currentTargetPlayerId;
    if (!targetId || input.playerId === targetId) {
      return this.state.touch(game, input.now);
    }

    const progress = this.state.mustGetProgress(game, input.playerId);
    if (progress instanceof Error) return progress;

    if (progress.reverseGiveUpsByTarget.includes(targetId)) {
      return this.state.touch(game, input.now);
    }

    progress.reverseGiveUpsByTarget.push(targetId);
    game.turns.push({
      id: input.turnRecordId,
      round: game.inProgress.round,
      askerPlayerId: input.playerId,
      targetWordOwnerId: targetId,
      outcome: "GIVEUP",
      createdAt: input.now,
    });

    const currentAsker = this.resolveCurrentAsker(game);
    if (currentAsker instanceof Error) return currentAsker;

    if (!game.inProgress.pendingVote && currentAsker === input.playerId) {
      this.advanceTurn(game, input.playerId);
    }

    const progressError = this.ensureProgress(game, input.now);
    if (progressError instanceof Error) return progressError;

    return this.state.touch(game, input.now);
  }

  private resolveVote(
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
      this.advanceTarget(game);
      return this.ensureProgress(game, now);
    }

    this.advanceTurn(game, pending.askerPlayerId);
    return this.ensureProgress(game, now);
  }

  private ensureProgress(game: GameState, now: string) {
    if (!game.inProgress.currentTargetPlayerId) {
      return this.state.finishGame(game, now);
    }

    const targetId = game.inProgress.currentTargetPlayerId;
    const availableGuessers = this.getGuessers(game, targetId);
    if (availableGuessers.length > 0) {
      return;
    }

    const word = game.words[targetId];
    if (word) {
      word.solved = true;
    }

    this.advanceTarget(game);
    if (!game.inProgress.currentTargetPlayerId) {
      return this.state.finishGame(game, now);
    }
  }

  private resolveCurrentAsker(game: GameState) {
    const current = game.inProgress.turnOrder[game.inProgress.turnCursor];
    if (!current) {
      return new appErrors.ReverseModeAskerMissingError();
    }

    return current;
  }

  private getGuessers(game: GameState, targetPlayerId: string): string[] {
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

  private advanceTurn(game: GameState, previousAskerId: string): void {
    const target = game.inProgress.currentTargetPlayerId;
    if (!target) {
      return;
    }

    const guessers = this.getGuessers(game, target);
    if (guessers.length === 0) {
      game.inProgress.turnOrder = [];
      game.inProgress.turnCursor = 0;
      this.advanceTarget(game);
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

  private advanceTarget(game: GameState): void {
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
        game.inProgress.turnOrder = this.getGuessers(game, candidate);
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
}


