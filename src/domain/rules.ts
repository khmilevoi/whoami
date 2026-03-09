export const computeMajorityDecision = (votes: Array<"YES" | "NO" | "GUESSED">): "YES" | "NO" | "GUESSED" => {
  const counters = { YES: 0, NO: 0, GUESSED: 0 };
  for (const vote of votes) {
    counters[vote] += 1;
  }

  if (counters.GUESSED > counters.YES && counters.GUESSED > counters.NO) {
    return "GUESSED";
  }

  if (counters.YES >= counters.NO) {
    return "YES";
  }

  return "NO";
};
