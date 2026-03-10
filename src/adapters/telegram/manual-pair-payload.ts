import type { ManualPairPayloadError } from "../../domain/errors";
import { InvalidManualPairPayloadError } from "../../domain/errors";

interface ManualPairPayload {
  gameId: string;
  targetPlayerId: string;
}

export const parseManualPairPayload = (
  payload: string,
): ManualPairPayload | ManualPairPayloadError => {
  const parts = payload.split(":");
  if (parts.length !== 3 || parts[0] !== "pair") {
    return new InvalidManualPairPayloadError();
  }

  const [, targetPlayerId, gameId] = parts;
  if (!targetPlayerId || !gameId) {
    return new InvalidManualPairPayloadError();
  }

  return { gameId, targetPlayerId } satisfies ManualPairPayload;
};
