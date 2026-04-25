import type { ReplyConversation, ReplyMessage } from "@/lib/reply/messaging-service";

export type ReplySocketEvent =
  | { type: "message.created"; conversationId: string; messages: ReplyMessage[]; conversation: ReplyConversation }
  | { type: "conversation.updated"; conversation: ReplyConversation }
  | { type: "invite.accepted"; conversation: ReplyConversation };

type BroadcastFn = (sessionTokens: string[], event: ReplySocketEvent) => void;

declare global {
  // eslint-disable-next-line no-var
  var __stayhandReplyBroadcast: BroadcastFn | undefined;
}

export function broadcastReplyEvent(sessionTokens: string[], event: ReplySocketEvent): void {
  globalThis.__stayhandReplyBroadcast?.(sessionTokens, event);
}
