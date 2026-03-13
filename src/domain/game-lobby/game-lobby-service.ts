import * as appErrors from "../errors.js";
import { GameStateAccessPort } from "../game-state-access/index.js";
import { GameLobbyPort } from "./game-lobby-port.js";
import { GameState, LobbyLimits, PlayerIdentity, StartGameInput } from "../types.js";

export class GameLobbyService implements GameLobbyPort {
  constructor(private readonly state: GameStateAccessPort) {}

  createGame(input: StartGameInput): GameState {
    const creator = this.state.toPlayerState(input.creator, input.now);

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
    const player = this.state.mustGetPlayer(game, playerId);
    if (player instanceof Error) return player;

    player.dmOpened = true;
    if (player.stage === "BLOCKED_DM") {
      player.stage = "JOINED";
    }

    return this.state.touch(game, now);
  }

  markDmBlocked(game: GameState, playerId: string, now: string) {
    const player = this.state.mustGetPlayer(game, playerId);
    if (player instanceof Error) return player;

    if (
      player.stage !== "READY" &&
      player.stage !== "GUESSED" &&
      player.stage !== "GAVE_UP"
    ) {
      player.stage = "BLOCKED_DM";
    }

    return this.state.touch(game, now);
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
      return this.state.touch(game, now);
    }

    if (game.players.length >= limits.maxPlayers) {
      return new appErrors.MaxPlayersReachedError({
        maxPlayers: limits.maxPlayers,
      });
    }

    const next = this.state.toPlayerState(player, now);
    game.players.push(next);
    game.progress[next.id] = {
      playerId: next.id,
      questionsAsked: 0,
      roundsUsed: 0,
      reverseGiveUpsByTarget: [],
    };

    return this.state.touch(game, now);
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
    return this.state.touch(game, now);
  }

  cancelGame(game: GameState, reason: string, now: string) {
    game.stage = "CANCELED";
    game.canceledReason = reason;
    return this.state.touch(game, now);
  }
}


