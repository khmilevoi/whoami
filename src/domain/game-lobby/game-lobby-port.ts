import * as appErrors from "../errors.js";
import { GameState, LobbyLimits, PlayerIdentity } from "../types.js";

export interface GameLobbyPort {
  createGame(input: {
    gameId: string;
    chatId: string;
    creator: PlayerIdentity;
    now: string;
  }): GameState;
  markDmOpened(
    game: GameState,
    playerId: string,
    now: string,
  ): GameState | appErrors.MarkDmError;
  markDmBlocked(
    game: GameState,
    playerId: string,
    now: string,
  ): GameState | appErrors.MarkDmError;
  joinGame(
    game: GameState,
    player: PlayerIdentity,
    limits: LobbyLimits,
    now: string,
  ): GameState | appErrors.JoinGameError;
  closeLobby(
    game: GameState,
    actorPlayerId: string,
    limits: LobbyLimits,
    now: string,
  ): GameState | appErrors.CloseLobbyError;
  cancelGame(game: GameState, reason: string, now: string): GameState;
}
