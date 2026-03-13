import * as appErrors from "../errors.js";
import { computeMajorityDecision } from "../rules.js";
import { AskQuestionInput, CastVoteInput, GiveUpInput } from "../round-action-input/index.js";
import { GameStateAccessPort, terminalPlayerStages } from "../game-state-access/index.js";
import { NormalRoundPort } from "./normal-round-port.js";

import { GameState, PendingVote } from "../types.js";

export class NormalRoundService implements NormalRoundPort {
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

    const round = game.inProgress.round;
    const asker = this.resolveCurrentAsker(game);
    if (asker instanceof Error) return asker;

    if (input.actorPlayerId !== asker) {
      return new appErrors.NotPlayersTurnError();
    }

    const askerProgress = this.state.mustGetProgress(game, asker);
    if (askerProgress instanceof Error) return askerProgress;

    askerProgress.questionsAsked += 1;
    askerProgress.roundsUsed = Math.max(askerProgress.roundsUsed, round);

    game.inProgress.pendingVote = {
      id: input.voteId,
      gameId: game.id,
      round,
      askerPlayerId: asker,
      questionText: input.questionText,
      eligibleVoterIds: this.getEligibleVoters(game, asker),
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

    const player = this.state.mustGetPlayer(game, input.playerId);
    if (player instanceof Error) return player;

    if (terminalPlayerStages.has(player.stage)) {
      return this.state.touch(game, input.now);
    }

    const progress = this.state.mustGetProgress(game, input.playerId);
    if (progress instanceof Error) return progress;

    player.stage = "GAVE_UP";
    progress.gaveUpAtRound = game.inProgress.round;
    progress.roundsUsed = Math.max(progress.roundsUsed, game.inProgress.round);

    game.turns.push({
      id: input.turnRecordId,
      round: game.inProgress.round,
      askerPlayerId: input.playerId,
      outcome: "GIVEUP",
      createdAt: input.now,
    });

    if (this.allPlayersFinished(game)) {
      const finishError = this.state.finishGame(game, input.now);
      if (finishError instanceof Error) return finishError;
      return this.state.touch(game, input.now);
    }

    const currentAsker = this.resolveCurrentAsker(game);
    if (currentAsker instanceof Error) return currentAsker;

    if (!game.inProgress.pendingVote && currentAsker === input.playerId) {
      const advanceError = this.advanceTurn(game);
      if (advanceError instanceof Error) return advanceError;
    }

    return this.state.touch(game, input.now);
  }

  private resolveVote(
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
      const player = this.state.mustGetPlayer(game, pending.askerPlayerId);
      if (player instanceof Error) return player;

      const progress = this.state.mustGetProgress(game, pending.askerPlayerId);
      if (progress instanceof Error) return progress;

      player.stage = "GUESSED";
      progress.guessedAtRound = pending.round;
      progress.roundsUsed = Math.max(progress.roundsUsed, pending.round);
      const advanceError = this.advanceTurn(game);
      if (advanceError instanceof Error) return advanceError;
    }

    if (outcome === "NO") {
      const advanceError = this.advanceTurn(game);
      if (advanceError instanceof Error) return advanceError;
    }

    if (!this.allPlayersFinished(game)) {
      return;
    }

    return this.state.finishGame(game, now);
  }

  private resolveCurrentAsker(game: GameState) {
    const active = new Set(this.getActivePlayers(game));
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

      const advanceError = this.advanceTurn(game);
      if (advanceError instanceof Error) return advanceError;
      guard += 1;
    }

    return new appErrors.UnableToResolveCurrentAskerError();
  }

  private getEligibleVoters(game: GameState, askerPlayerId: string): string[] {
    return game.players
      .filter(
        (player) => player.id !== askerPlayerId && player.stage !== "GAVE_UP",
      )
      .map((player) => player.id);
  }

  private getActivePlayers(game: GameState): string[] {
    return game.players
      .filter((player) => !terminalPlayerStages.has(player.stage))
      .map((player) => player.id);
  }

  private allPlayersFinished(game: GameState): boolean {
    return game.players.every((player) => terminalPlayerStages.has(player.stage));
  }

  private advanceTurn(game: GameState) {
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

      const player = this.state.mustGetPlayer(game, candidate);
      if (player instanceof Error) return player;
      if (!terminalPlayerStages.has(player.stage)) {
        return;
      }

      iterations += 1;
    }

    return;
  }
}




