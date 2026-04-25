import { NextResponse } from "next/server";
import { analyzeReplyDraft } from "@/lib/real-mode/reply-service";
import type { ReplyCoachMessage, BotPersona } from "@/lib/real-mode/types";

// Legacy handler — used when no conversationId is provided (demo mode, unauthenticated)
export default async function legacyAnalyze(body: {
  draft?: string;
  incomingMessage?: string;
  context?: string;
  botPersona?: unknown;
  conversationKind?: unknown;
  otherPartyName?: unknown;
  userName?: unknown;
  conversation_context?: unknown;
  latest_incoming_message?: unknown;
  user_draft?: unknown;
  [key: string]: unknown;
}) {
  const isCoachMsg = (x: unknown): x is ReplyCoachMessage =>
    typeof x === "object" &&
    x !== null &&
    ((x as ReplyCoachMessage).speaker_type === "user" || (x as ReplyCoachMessage).speaker_type === "other_person") &&
    typeof (x as ReplyCoachMessage).speaker_name === "string" &&
    typeof (x as ReplyCoachMessage).message === "string";

  const conversationContext = Array.isArray(body.conversation_context)
    ? (body.conversation_context as unknown[]).filter(isCoachMsg)
    : [];

  const latestIncoming = isCoachMsg(body.latest_incoming_message) ? body.latest_incoming_message : undefined;
  const userDraft = isCoachMsg(body.user_draft) ? body.user_draft : undefined;

  const botPersona =
    body.botPersona &&
    typeof body.botPersona === "object" &&
    typeof (body.botPersona as BotPersona).name === "string"
      ? (body.botPersona as BotPersona)
      : undefined;

  const { result, live, model } = await analyzeReplyDraft({
    draft: typeof body.draft === "string" ? body.draft : "",
    incomingMessage: typeof body.incomingMessage === "string" ? body.incomingMessage : undefined,
    context: typeof body.context === "string" ? body.context : undefined,
    conversationContext,
    latestIncomingMessage: latestIncoming,
    userDraft,
    botPersona,
    conversationKind:
      body.conversationKind === "bot" || body.conversationKind === "human"
        ? body.conversationKind
        : undefined,
    otherPartyName: typeof body.otherPartyName === "string" ? body.otherPartyName : undefined,
    userName: typeof body.userName === "string" ? body.userName : undefined,
  });

  return NextResponse.json({ result, live, model });
}
