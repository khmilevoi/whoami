import Database from "better-sqlite3";
import { GameRepository } from "../../application/ports";
import { FinalScore, GameState } from "../../domain/types";

const activeStages = ["LOBBY_OPEN", "LOBBY_CLOSED", "CONFIGURING", "PREPARE_WORDS", "READY_WAIT", "IN_PROGRESS"];

export class SqliteGameRepository implements GameRepository {
  constructor(private readonly db: Database.Database) {}

  create(game: GameState): void {
    this.save(game, false);
  }

  update(game: GameState): void {
    this.save(game, true);
  }

  findById(gameId: string): GameState | null {
    const row = this.db.prepare("SELECT state_json FROM games WHERE id = ?").get(gameId) as { state_json: string } | undefined;
    if (!row) {
      return null;
    }
    return JSON.parse(row.state_json) as GameState;
  }

  findActiveByChatId(chatId: string): GameState | null {
    const sql = `
      SELECT state_json
      FROM games
      WHERE chat_id = ?
        AND stage IN (${activeStages.map(() => "?").join(",")})
      ORDER BY updated_at DESC
      LIMIT 1
    `;

    const row = this.db.prepare(sql).get(chatId, ...activeStages) as { state_json: string } | undefined;
    if (!row) {
      return null;
    }

    return JSON.parse(row.state_json) as GameState;
  }

  listActiveGames(): GameState[] {
    const sql = `
      SELECT state_json
      FROM games
      WHERE stage IN (${activeStages.map(() => "?").join(",")})
      ORDER BY updated_at DESC
    `;

    const rows = this.db.prepare(sql).all(...activeStages) as Array<{ state_json: string }>;
    return rows.map((row) => JSON.parse(row.state_json) as GameState);
  }
  private save(game: GameState, isUpdate: boolean): void {
    const snapshot = JSON.stringify(game);

    if (isUpdate) {
      this.db
        .prepare(
          `
          UPDATE games
          SET
            chat_id = @chatId,
            creator_player_id = @creatorPlayerId,
            creator_telegram_user_id = @creatorTelegramUserId,
            stage = @stage,
            mode = @mode,
            play_mode = @playMode,
            pairing_mode = @pairingMode,
            state_json = @stateJson,
            canceled_reason = @canceledReason,
            updated_at = @updatedAt,
            finished_at = @finishedAt
          WHERE id = @id
        `,
        )
        .run({
          id: game.id,
          chatId: game.chatId,
          creatorPlayerId: game.creatorPlayerId,
          creatorTelegramUserId: game.creatorTelegramUserId,
          stage: game.stage,
          mode: game.config?.mode ?? null,
          playMode: game.config?.playMode ?? null,
          pairingMode: game.config?.pairingMode ?? null,
          stateJson: snapshot,
          canceledReason: game.canceledReason ?? null,
          updatedAt: game.updatedAt,
          finishedAt: game.stage === "FINISHED" || game.stage === "CANCELED" ? game.updatedAt : null,
        });
    } else {
      this.db
        .prepare(
          `
          INSERT INTO games (
            id, chat_id, creator_player_id, creator_telegram_user_id,
            stage, mode, play_mode, pairing_mode, state_json,
            canceled_reason, created_at, updated_at, finished_at
          ) VALUES (
            @id, @chatId, @creatorPlayerId, @creatorTelegramUserId,
            @stage, @mode, @playMode, @pairingMode, @stateJson,
            @canceledReason, @createdAt, @updatedAt, @finishedAt
          )
        `,
        )
        .run({
          id: game.id,
          chatId: game.chatId,
          creatorPlayerId: game.creatorPlayerId,
          creatorTelegramUserId: game.creatorTelegramUserId,
          stage: game.stage,
          mode: game.config?.mode ?? null,
          playMode: game.config?.playMode ?? null,
          pairingMode: game.config?.pairingMode ?? null,
          stateJson: snapshot,
          canceledReason: game.canceledReason ?? null,
          createdAt: game.createdAt,
          updatedAt: game.updatedAt,
          finishedAt: game.stage === "FINISHED" || game.stage === "CANCELED" ? game.updatedAt : null,
        });
    }

    this.syncPlayers(game);
    this.syncGamePlayers(game);
    this.syncPairings(game);
    this.syncWords(game);
    this.syncTurns(game);
    this.syncVotes(game);
    this.syncResults(game);
  }

  private syncPlayers(game: GameState): void {
    const stmt = this.db.prepare(
      `
      INSERT INTO players (id, telegram_user_id, username, display_name, created_at)
      VALUES (@id, @telegramUserId, @username, @displayName, @createdAt)
      ON CONFLICT(id) DO UPDATE SET
        telegram_user_id = excluded.telegram_user_id,
        username = excluded.username,
        display_name = excluded.display_name
    `,
    );

    for (const player of game.players) {
      stmt.run({
        id: player.id,
        telegramUserId: player.telegramUserId,
        username: player.username ?? null,
        displayName: player.displayName,
        createdAt: player.joinedAt,
      });
    }
  }

  private syncGamePlayers(game: GameState): void {
    this.db.prepare("DELETE FROM game_players WHERE game_id = ?").run(game.id);

    const stmt = this.db.prepare(
      `
      INSERT INTO game_players (game_id, player_id, join_order, player_stage, dm_opened)
      VALUES (@gameId, @playerId, @joinOrder, @playerStage, @dmOpened)
    `,
    );

    game.players.forEach((player, index) => {
      stmt.run({
        gameId: game.id,
        playerId: player.id,
        joinOrder: index,
        playerStage: player.stage,
        dmOpened: player.dmOpened ? 1 : 0,
      });
    });
  }

  private syncPairings(game: GameState): void {
    this.db.prepare("DELETE FROM pairings WHERE game_id = ?").run(game.id);

    const stmt = this.db.prepare(
      `
      INSERT INTO pairings (game_id, owner_player_id, target_player_id)
      VALUES (@gameId, @ownerPlayerId, @targetPlayerId)
    `,
    );

    for (const [owner, target] of Object.entries(game.pairings)) {
      stmt.run({ gameId: game.id, ownerPlayerId: owner, targetPlayerId: target });
    }
  }

  private syncWords(game: GameState): void {
    this.db.prepare("DELETE FROM words WHERE game_id = ?").run(game.id);

    const stmt = this.db.prepare(
      `
      INSERT INTO words (
        game_id, owner_player_id, target_player_id, word, clue,
        word_confirmed, final_confirmed, solved
      ) VALUES (
        @gameId, @ownerPlayerId, @targetPlayerId, @word, @clue,
        @wordConfirmed, @finalConfirmed, @solved
      )
    `,
    );

    for (const entry of Object.values(game.words)) {
      stmt.run({
        gameId: game.id,
        ownerPlayerId: entry.ownerPlayerId,
        targetPlayerId: entry.targetPlayerId ?? null,
        word: entry.word ?? null,
        clue: entry.clue ?? null,
        wordConfirmed: entry.wordConfirmed ? 1 : 0,
        finalConfirmed: entry.finalConfirmed ? 1 : 0,
        solved: entry.solved ? 1 : 0,
      });
    }
  }

  private syncTurns(game: GameState): void {
    this.db.prepare("DELETE FROM turns WHERE game_id = ?").run(game.id);

    const stmt = this.db.prepare(
      `
      INSERT INTO turns (
        id, game_id, round, asker_player_id,
        target_word_owner_id, question_text, outcome, created_at
      ) VALUES (
        @id, @gameId, @round, @askerPlayerId,
        @targetWordOwnerId, @questionText, @outcome, @createdAt
      )
    `,
    );

    for (const turn of game.turns) {
      stmt.run({
        id: turn.id,
        gameId: game.id,
        round: turn.round,
        askerPlayerId: turn.askerPlayerId,
        targetWordOwnerId: turn.targetWordOwnerId ?? null,
        questionText: turn.questionText ?? null,
        outcome: turn.outcome,
        createdAt: turn.createdAt,
      });
    }
  }

  private syncVotes(game: GameState): void {
    this.db.prepare("DELETE FROM votes WHERE game_id = ?").run(game.id);

    const stmt = this.db.prepare(
      `
      INSERT INTO votes (id, game_id, pending_vote_id, voter_player_id, decision, created_at)
      VALUES (@id, @gameId, @pendingVoteId, @voterPlayerId, @decision, @createdAt)
    `,
    );

    for (const vote of game.voteHistory) {
      stmt.run({
        id: vote.id,
        gameId: game.id,
        pendingVoteId: vote.pendingVoteId,
        voterPlayerId: vote.voterPlayerId,
        decision: vote.decision,
        createdAt: vote.createdAt,
      });
    }
  }

  private syncResults(game: GameState): void {
    if (!game.result) {
      return;
    }

    this.db
      .prepare(
        `
        INSERT INTO game_results (game_id, mode, created_at, raw_json)
        VALUES (@gameId, @mode, @createdAt, @rawJson)
        ON CONFLICT(game_id) DO UPDATE SET
          mode = excluded.mode,
          created_at = excluded.created_at,
          raw_json = excluded.raw_json
      `,
      )
      .run({
        gameId: game.id,
        mode: game.result.mode,
        createdAt: game.result.createdAt,
        rawJson: JSON.stringify(game.result),
      });

    this.db.prepare("DELETE FROM player_results WHERE game_id = ?").run(game.id);

    const stmt = this.db.prepare(
      `
      INSERT INTO player_results (
        game_id, player_id, context, rounds, questions, avg_rounds, avg_questions, crowns_json
      ) VALUES (
        @gameId, @playerId, @context, @rounds, @questions, @avgRounds, @avgQuestions, @crownsJson
      )
    `,
    );

    const insertRows = (scores: FinalScore[], context: string): void => {
      for (const score of scores) {
        stmt.run({
          gameId: game.id,
          playerId: score.playerId,
          context,
          rounds: score.rounds,
          questions: score.questions,
          avgRounds: score.avgRounds ?? null,
          avgQuestions: score.avgQuestions ?? null,
          crownsJson: JSON.stringify(score.crowns),
        });
      }
    };

    if (game.result.normal) {
      insertRows(game.result.normal, "NORMAL");
    }
    if (game.result.reverse) {
      insertRows(game.result.reverse.asWordOwner, "REVERSE_OWNER");
      insertRows(game.result.reverse.asGuesser, "REVERSE_GUESSER");
    }
  }
}

