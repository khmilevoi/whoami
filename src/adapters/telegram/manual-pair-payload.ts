import { DomainError } from "../../domain/errors";

export interface ManualPairPayload {
  targetPlayerId: string;
  gameId: string;
}

const manualPairPayloadPattern = /^pair:(.+):([^:]+)$/;

export const parseManualPairPayload = (payload: string): ManualPairPayload => {
  const match = manualPairPayloadPattern.exec(payload);
  if (!match) {
    throw new DomainError({ code: "INVALID_MANUAL_PAIR_PAYLOAD" });
  }

  const [, targetPlayerId, gameId] = match;
  if (!targetPlayerId || !gameId) {
    throw new DomainError({ code: "INVALID_MANUAL_PAIR_PAYLOAD" });
  }

  return { targetPlayerId, gameId };
};
