import type { ManualPairPayloadError } from "../../domain/errors.js";
import { InvalidManualPairPayloadError } from "../../domain/errors.js";

interface ManualPairPayload {
  gameId: string;
  targetPlayerId: string;
}

export const parseManualPairPayload = (
  payload: string,
): ManualPairPayload | ManualPairPayloadError => {
  const matched = /^pair:(.+):([^:]+)$/.exec(payload);
  if (!matched) {
    return new InvalidManualPairPayloadError();
  }

  const [, targetPlayerId, gameId] = matched;
  if (!targetPlayerId || !gameId) {
    return new InvalidManualPairPayloadError();
  }

  return { gameId, targetPlayerId } satisfies ManualPairPayload;
};
