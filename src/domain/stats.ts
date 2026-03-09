import { FinalScore, GameMode, GameResult, GameState, ReverseSummary } from "./types";

const addCrowns = (scores: FinalScore[]): FinalScore[] => {
  if (scores.length === 0) {
    return scores;
  }

  const minRounds = Math.min(...scores.map((s) => s.rounds));
  const minQuestions = Math.min(...scores.map((s) => s.questions));

  return scores.map((score) => {
    const crowns: string[] = [];
    if (score.rounds === minRounds) {
      crowns.push("MIN_ROUNDS");
    }
    if (score.questions === minQuestions) {
      crowns.push("MIN_QUESTIONS");
    }
    return { ...score, crowns };
  });
};

const computeNormalScores = (game: GameState): FinalScore[] => {
  const base = game.players.map((player) => {
    const progress = game.progress[player.id];
    return {
      playerId: player.id,
      rounds: progress.roundsUsed,
      questions: progress.questionsAsked,
      crowns: [],
    } satisfies FinalScore;
  });
  return addCrowns(base);
};

const computeReverseScores = (game: GameState): ReverseSummary => {
  const ownerScores: FinalScore[] = game.players.map((player) => {
    const turnsForOwner = game.turns.filter((t) => t.targetWordOwnerId === player.id);
    const rounds = turnsForOwner.length === 0 ? 0 : Math.max(...turnsForOwner.map((t) => t.round));
    return {
      playerId: player.id,
      rounds,
      questions: turnsForOwner.length,
      crowns: [],
    };
  });

  const guesserScores: FinalScore[] = game.players.map((player) => {
    const turnsByPlayer = game.turns.filter((t) => t.askerPlayerId === player.id);
    const wordsAttempted = new Set(turnsByPlayer.map((t) => t.targetWordOwnerId).filter(Boolean)).size || 1;
    const rounds = turnsByPlayer.length === 0 ? 0 : Math.max(...turnsByPlayer.map((t) => t.round));

    return {
      playerId: player.id,
      rounds,
      questions: turnsByPlayer.length,
      avgRounds: Number((rounds / wordsAttempted).toFixed(2)),
      avgQuestions: Number((turnsByPlayer.length / wordsAttempted).toFixed(2)),
      crowns: [],
    };
  });

  return {
    asWordOwner: addCrowns(ownerScores),
    asGuesser: addCrowns(guesserScores),
  };
};

export const buildGameResult = (game: GameState, now: string): GameResult => {
  if (!game.config) {
    throw new Error("Cannot compute game result without config");
  }

  const base = {
    gameId: game.id,
    mode: game.config.mode,
    createdAt: now,
  } satisfies Pick<GameResult, "gameId" | "mode" | "createdAt">;

  if (game.config.mode === "NORMAL") {
    return {
      ...base,
      normal: computeNormalScores(game),
    };
  }

  return {
    ...base,
    reverse: computeReverseScores(game),
  };
};

export const gameModeLabel = (mode: GameMode): string => {
  return mode === "NORMAL" ? "обычный" : "обратный";
};