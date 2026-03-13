import { VoteDecision } from "../types.js";

export interface AskQuestionInput {
  actorPlayerId: string;
  questionText?: string;
  voteId: string;
  now: string;
}

export interface CastVoteInput {
  voterPlayerId: string;
  decision: VoteDecision;
  voteRecordId: string;
  turnRecordId: string;
  now: string;
}

export interface GiveUpInput {
  playerId: string;
  turnRecordId: string;
  now: string;
}
