import type { PairingError, PairingValidationError } from "./errors";
import {
  NeedAtLeastTwoPlayersForPairingsError,
  PlayerCannotPairWithSelfError,
  PlayerHasAlreadySelectedAPairError,
  SelectedTargetIsAlreadyTakenError,
  UnknownPlayerInManualPairingError,
} from "./errors";

export const buildRandomDerangement = (playerIds: string[]): Record<string, string> | PairingError => {
  if (playerIds.length < 2) {
    return new NeedAtLeastTwoPlayersForPairingsError();
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
): void | PairingValidationError => {
  if (!allPlayerIds.includes(chooserId) || !allPlayerIds.includes(targetId)) {
    return new UnknownPlayerInManualPairingError();
  }
  if (chooserId === targetId) {
    return new PlayerCannotPairWithSelfError();
  }
  if (existingPairings[chooserId]) {
    return new PlayerHasAlreadySelectedAPairError();
  }

  const selectedTargets = new Set(Object.values(existingPairings));
  if (selectedTargets.has(targetId)) {
    return new SelectedTargetIsAlreadyTakenError();
  }
};
