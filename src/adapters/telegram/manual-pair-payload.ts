import { DomainError } from "../../domain/errors";

export interface ManualPairPayload {
  targetPlayerId: string;
  gameId: string;
}

const manualPairPayloadPattern = /^pair:(.+):([^:]+)$/;

export const parseManualPairPayload = (payload: string): ManualPairPayload => {
  const match = manualPairPayloadPattern.exec(payload);
  if (!match) {
    throw new DomainError("Некорректные данные выбора пары");
  }

  const [, targetPlayerId, gameId] = match;
  if (!targetPlayerId || !gameId) {
    throw new DomainError("Некорректные данные выбора пары");
  }

  return { targetPlayerId, gameId };
};
