import { InvalidStartPayloadError } from "../../domain/errors.js";

export interface StartPayload {
  action: "join" | "open";
  gameId: string;
}

const parseParts = (payload: string): StartPayload | InvalidStartPayloadError => {
  const [rawAction, ...rest] = payload.split("-");
  const gameId = rest.join("-").trim();

  if (!rawAction || !gameId) {
    return new InvalidStartPayloadError();
  }

  if (rawAction !== "join" && rawAction !== "open") {
    return new InvalidStartPayloadError();
  }

  return {
    action: rawAction,
    gameId,
  };
};

export const parseStartPayload = (
  payload: string | undefined,
): StartPayload | null | InvalidStartPayloadError => {
  if (!payload) {
    return null;
  }

  return parseParts(payload.trim());
};
