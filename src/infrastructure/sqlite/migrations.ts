import Database from "better-sqlite3";

const migrationSql = [
  `
  CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    creator_player_id TEXT NOT NULL,
    creator_telegram_user_id TEXT NOT NULL,
    stage TEXT NOT NULL,
    mode TEXT,
    play_mode TEXT,
    pairing_mode TEXT,
    state_json TEXT NOT NULL,
    canceled_reason TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    finished_at TEXT
  );
  `,
  `
  CREATE UNIQUE INDEX IF NOT EXISTS ux_games_active_chat
  ON games(chat_id)
  WHERE stage IN ('LOBBY_OPEN','LOBBY_CLOSED','CONFIGURING','PREPARE_WORDS','READY_WAIT','IN_PROGRESS');
  `,
  `
  CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    telegram_user_id TEXT NOT NULL UNIQUE,
    username TEXT,
    display_name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS game_players (
    game_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    join_order INTEGER NOT NULL,
    player_stage TEXT NOT NULL,
    dm_opened INTEGER NOT NULL,
    PRIMARY KEY (game_id, player_id),
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS pairings (
    game_id TEXT NOT NULL,
    owner_player_id TEXT NOT NULL,
    target_player_id TEXT NOT NULL,
    PRIMARY KEY (game_id, owner_player_id),
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_player_id) REFERENCES players(id) ON DELETE CASCADE,
    FOREIGN KEY (target_player_id) REFERENCES players(id) ON DELETE CASCADE,
    CHECK (owner_player_id <> target_player_id)
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS words (
    game_id TEXT NOT NULL,
    owner_player_id TEXT NOT NULL,
    target_player_id TEXT,
    word TEXT,
    clue TEXT,
    word_confirmed INTEGER NOT NULL,
    final_confirmed INTEGER NOT NULL,
    solved INTEGER NOT NULL,
    PRIMARY KEY (game_id, owner_player_id),
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_player_id) REFERENCES players(id) ON DELETE CASCADE
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS turns (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL,
    round INTEGER NOT NULL,
    asker_player_id TEXT NOT NULL,
    target_word_owner_id TEXT,
    question_text TEXT,
    outcome TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS votes (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL,
    pending_vote_id TEXT NOT NULL,
    voter_player_id TEXT NOT NULL,
    decision TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS game_results (
    game_id TEXT PRIMARY KEY,
    mode TEXT NOT NULL,
    created_at TEXT NOT NULL,
    raw_json TEXT NOT NULL,
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS player_results (
    game_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    context TEXT NOT NULL,
    rounds REAL NOT NULL,
    questions REAL NOT NULL,
    avg_rounds REAL,
    avg_questions REAL,
    crowns_json TEXT NOT NULL,
    PRIMARY KEY (game_id, player_id, context),
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
  );
  `,
];

export const runMigrations = (db: Database.Database): void => {
  for (const sql of migrationSql) {
    db.exec(sql);
  }
};
