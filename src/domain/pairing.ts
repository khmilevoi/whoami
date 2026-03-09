import { DomainError } from "./errors";

export const buildRandomDerangement = (playerIds: string[]): Record<string, string> => {
  if (playerIds.length < 2) {
    throw new DomainError({ code: "NEED_AT_LEAST_TWO_PLAYERS_FOR_PAIRINGS" });
  }

  const shuffled = [...playerIds];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = temp;
  }

  const rotated = [...shuffled.slice(1), shuffled[0]];
  const pairings: Record<string, string> = {};
  for (let i = 0; i < shuffled.length; i += 1) {
    pairings[shuffled[i]] = rotated[i];
  }

  for (const [from, to] of Object.entries(pairings)) {
    if (from === to) {
      return buildRandomDerangement(playerIds);
    }
  }

  return pairings;
};

export const validateManualPairChoice = (
  chooserId: string,
  targetId: string,
  existingPairings: Record<string, string>,
  allPlayerIds: string[],
): void => {
  if (!allPlayerIds.includes(chooserId) || !allPlayerIds.includes(targetId)) {
    throw new DomainError({ code: "UNKNOWN_PLAYER_IN_MANUAL_PAIRING" });
  }
  if (chooserId === targetId) {
    throw new DomainError({ code: "PLAYER_CANNOT_PAIR_WITH_SELF" });
  }
  if (existingPairings[chooserId]) {
    throw new DomainError({ code: "PLAYER_HAS_ALREADY_SELECTED_A_PAIR" });
  }

  const selectedTargets = new Set(Object.values(existingPairings));
  if (selectedTargets.has(targetId)) {
    throw new DomainError({ code: "SELECTED_TARGET_IS_ALREADY_TAKEN" });
  }
};
