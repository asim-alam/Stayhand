import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { analyzeReplyDraft } from "@/lib/real-mode/reply-service";
import { getReplyUserBySession, listMessages, getConversationForUser, REPLY_SESSION_COOKIE } from "@/lib/reply/messaging-service";
import type { ReplyCoachMessage } from "@/lib/real-mode/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(REPLY_SESSION_COOKIE)?.value;
    const user = await getReplyUserBySession(token);

    const body = await request.json() as {
      conversationId?: string;
      draft?: string;
      // Legacy fallback fields — still accepted but not trusted for context
      incomingMessage?: string;
      context?: string;
      botPersona?: unknown;
      conversationKind?: unknown;
      otherPartyName?: unknown;
      userName?: unknown;
    };

    if (typeof body.draft !== "string" || !body.draft.trim()) {
      return NextResponse.json({ error: "draft is required" }, { status: 400 });
    }

    // If we have a conversationId and an authenticated user, build context server-side
    if (user && typeof body.conversationId === "string" && body.conversationId) {
      try {
        const { messages, conversation } = await listMessages(user.id, body.conversationId);

        // Identify who is "us" and who is "other"
        const otherParticipant = conversation.participants.find(
          (p) => p.type === "user" && p.id !== user.id
        );
        const otherName = otherParticipant?.displayName ?? conversation.title ?? "the other person";

        // Build server-side conversation context (last 10 messages)
        const conversationContext: ReplyCoachMessage[] = messages.slice(-10).map((msg) => ({
          speaker_type: msg.senderId === user.id ? "user" : "other_person",
          speaker_name: msg.senderName,
          message: msg.body,
          timestamp: msg.createdAt,
          is_latest_incoming: false,
        }));

        // Find the latest incoming message from the other person
        const latestIncomingMsg = [...messages]
          .reverse()
          .find((msg) => msg.senderId !== user.id);

        const latestIncomingMessage: ReplyCoachMessage | undefined = latestIncomingMsg
          ? {
              speaker_type: "other_person",
              speaker_name: latestIncomingMsg.senderName,
              message: latestIncomingMsg.body,
              timestamp: latestIncomingMsg.createdAt,
              is_latest_incoming: true,
            }
          : undefined;

        // Mark the latest incoming in context
        if (latestIncomingMsg) {
          const idx = conversationContext.findIndex((m) => m.timestamp === latestIncomingMsg.createdAt);
          if (idx !== -1) conversationContext[idx].is_latest_incoming = true;
        }

        const userDraft: ReplyCoachMessage = {
          speaker_type: "user",
          speaker_name: user.displayName,
          message: body.draft.trim(),
          timestamp: new Date().toISOString(),
        };

        // Detect if bot conversation
        const conversationKind = conversation.kind;
        const botPersonaId = conversation.botId;
        const BOT_PERSONAS: Record<string, { name: string; role: string; personality: string }> = {
          "bot-alex": {
            name: "Alex",
            role: "conflict repair partner",
            personality: "sensitive but fair; names the emotional impact and responds better to accountability than defensiveness",
          },
          "bot-maya": {
            name: "Maya",
            role: "deadline-focused coworker",
            personality: "direct, practical, low patience for vague replies; wants ownership and a specific next step",
          },
          "bot-priya": {
            name: "Priya",
            role: "calm mediator",
            personality: "measured, curious, and clarifying; helps turn tension into a concrete shared decision",
          },
        };
        const botPersona = conversationKind === "bot" && botPersonaId
          ? BOT_PERSONAS[botPersonaId]
          : undefined;

        const { result, live, model } = await analyzeReplyDraft({
          draft: body.draft.trim(),
          conversationContext,
          latestIncomingMessage,
          userDraft,
          botPersona,
          conversationKind,
          otherPartyName: conversationKind === "human" ? otherName : undefined,
          userName: user.displayName,
        });

        return NextResponse.json({ result, live, model });
      } catch (err) {
        // If conversation lookup fails (e.g. not a participant), fall through to legacy mode
        if (process.env.NODE_ENV === "development") {
          console.warn("[analyze] Server-side context build failed, falling back:", err instanceof Error ? err.message : err);
        }
      }
    }

    // Legacy fallback: accept context from client (e.g. demo mode, no auth)
    const { default: legacyAnalyze } = await import("./legacy");
    return legacyAnalyze(body);

  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "failed to analyze reply" },
      { status: 500 }
    );
  }
}
