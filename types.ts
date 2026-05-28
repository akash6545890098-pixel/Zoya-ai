/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ConnectionState = "disconnected" | "connecting" | "listening" | "speaking" | "error";

export type ReactionType = "wink" | "sparkle" | "shock" | "heart_burst";

export interface ToolCallData {
  callId: string;
  name: string;
  args: any;
}

export interface SassyReaction {
  id: string;
  type: ReactionType;
  reason: string;
  timestamp: number;
}

export interface LiveMessage {
  id: string;
  type: "status" | "error" | "info" | "toolCall" | "toolResponse" | "interrupted";
  text: string;
  timestamp: number;
}
