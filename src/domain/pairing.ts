import { DomainError } from "./errors";

export const buildRandomDerangement = (playerIds: string[]): Record<string, string> => {
  if (playerIds.length < 2) {
    throw new DomainError("Need at least two players to build pairings");
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
    throw new DomainError("Unknown player in manual pairing");
  }
  if (chooserId === targetId) {
    throw new DomainError("Player cannot pair with self");
  }
  if (existingPairings[chooserId]) {
    throw new DomainError("Player has already selected a pair");
  }

  const selectedTargets = new Set(Object.values(existingPairings));
  if (selectedTargets.has(targetId)) {
    throw new DomainError("Selected target is already taken");
  }
};