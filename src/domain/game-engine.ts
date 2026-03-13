import { AskQuestionInput, CastVoteInput, GiveUpInput } from "./round-action-input/index.js";
import { GameLobbyPort, GameLobbyService } from "./game-lobby/index.js";
import { GamePreparationPort, GamePreparationService } from "./game-preparation/index.js";
import { GameStateAccessService } from "./game-state-access/index.js";
import { NormalRoundPort, NormalRoundService } from "./normal-round/index.js";
import { ReverseRoundPort, ReverseRoundService } from "./reverse-round/index.js";
import { GameState, StartGameInput } from "./types.js";
import { WordPreparationPort, WordPreparationService } from "./word-preparation/index.js";

export class GameEngine {
  private readonly lobby: GameLobbyPort;
  private readonly preparation: GamePreparationPort;
  private readonly wordPreparation: WordPreparationPort;
  private readonly normalRound: NormalRoundPort;
  private readonly reverseRound: ReverseRoundPort;

  constructor(deps?: {
    lobby?: GameLobbyPort;
    preparation?: GamePreparationPort;
    wordPreparation?: WordPreparationPort;
    normalRound?: NormalRoundPort;
    reverseRound?: ReverseRoundPort;
  }) {
    const state = new GameStateAccessService();
    this.lobby = deps?.lobby ?? new GameLobbyService(state);
    this.preparation = deps?.preparation ?? new GamePreparationService(state);
    this.wordPreparation =
      deps?.wordPreparation ?? new WordPreparationService(state);
    this.normalRound = deps?.normalRound ?? new NormalRoundService(state);
    this.reverseRound = deps?.reverseRound ?? new ReverseRoundService(state);
  }

  createGame(input: StartGameInput): GameState {
    return this.lobby.createGame(input);
  }

  markDmOpened(game: GameState, playerId: string, now: string) {
    return this.lobby.markDmOpened(game, playerId, now);
  }

  markDmBlocked(game: GameState, playerId: string, now: string) {
    return this.lobby.markDmBlocked(game, playerId, now);
  }

  joinGame(...args: Parameters<GameLobbyPort["joinGame"]>) {
    return this.lobby.joinGame(...args);
  }

  closeLobby(...args: Parameters<GameLobbyPort["closeLobby"]>) {
    return this.lobby.closeLobby(...args);
  }

  configureGame(...args: Parameters<GamePreparationPort["configureGame"]>) {
    return this.preparation.configureGame(...args);
  }

  selectManualPair(...args: Parameters<GamePreparationPort["selectManualPair"]>) {
    return this.preparation.selectManualPair(...args);
  }

  submitWord(...args: Parameters<WordPreparationPort["submitWord"]>) {
    return this.wordPreparation.submitWord(...args);
  }

  confirmWord(...args: Parameters<WordPreparationPort["confirmWord"]>) {
    return this.wordPreparation.confirmWord(...args);
  }

  submitClue(...args: Parameters<WordPreparationPort["submitClue"]>) {
    return this.wordPreparation.submitClue(...args);
  }

  finalizeWord(...args: Parameters<WordPreparationPort["finalizeWord"]>) {
    return this.wordPreparation.finalizeWord(...args);
  }

  startGameIfReady(...args: Parameters<WordPreparationPort["startGameIfReady"]>) {
    return this.wordPreparation.startGameIfReady(...args);
  }

  askQuestion(game: GameState, input: AskQuestionInput) {
    if (game.config?.mode === "REVERSE") {
      return this.reverseRound.askQuestion(game, input);
    }

    return this.normalRound.askQuestion(game, input);
  }

  castVote(game: GameState, input: CastVoteInput) {
    if (game.config?.mode === "REVERSE") {
      return this.reverseRound.castVote(game, input);
    }

    return this.normalRound.castVote(game, input);
  }

  giveUp(game: GameState, input: GiveUpInput) {
    if (game.config?.mode === "REVERSE") {
      return this.reverseRound.giveUp(game, input);
    }

    return this.normalRound.giveUp(game, input);
  }

  cancelGame(game: GameState, reason: string, now: string) {
    return this.lobby.cancelGame(game, reason, now);
  }
}
