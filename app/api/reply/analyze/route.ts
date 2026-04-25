import { NextResponse } from "next/server";
import { analyzeReplyDraft } from "@/lib/real-mode/reply-service";
import type { ThreadMessage, BotPersona, ReplyCoachMessage } from "@/lib/real-mode/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      incomingMessage?: string;
      draft?: string;
      context?: string;
      channel?: string;
      audience?: string;
      thread?: ThreadMessage[];
      conversation_context?: ReplyCoachMessage[];
      latest_incoming_message?: ReplyCoachMessage;
      user_draft?: ReplyCoachMessage;
      botPersona?: BotPersona;
      conversationKind?: "bot" | "human";
      otherPartyName?: string;
      userName?: string;
    };

    if (typeof body.draft !== "string") {
      return NextResponse.json({ error: "draft is required" }, { status: 400 });
    }

    const response = await analyzeReplyDraft({
      incomingMessage: typeof body.incomingMessage === "string" ? body.incomingMessage : undefined,
      draft: body.draft,
      context: typeof body.context === "string" ? body.context : undefined,
      channel: typeof body.channel === "string" ? body.channel : undefined,
      audience: typeof body.audience === "string" ? body.audience : undefined,
      thread: Array.isArray(body.thread) ? body.thread : [],
      conversationContext: Array.isArray(body.conversation_context)
        ? body.conversation_context.filter(
            (message): message is ReplyCoachMessage =>
              typeof message === "object" &&
              message !== null &&
              (message.speaker_type === "user" || message.speaker_type === "other_person") &&
              typeof message.speaker_name === "string" &&
              typeof message.message === "string"
          )
        : [],
      latestIncomingMessage: body.latest_incoming_message &&
        (body.latest_incoming_message.speaker_type === "user" || body.latest_incoming_message.speaker_type === "other_person") &&
        typeof body.latest_incoming_message.speaker_name === "string" &&
        typeof body.latest_incoming_message.message === "string"
          ? body.latest_incoming_message
          : undefined,
      userDraft: body.user_draft &&
        body.user_draft.speaker_type === "user" &&
        typeof body.user_draft.speaker_name === "string" &&
        typeof body.user_draft.message === "string"
          ? body.user_draft
          : undefined,
      botPersona: body.botPersona ?? undefined,
      conversationKind: body.conversationKind === "bot" || body.conversationKind === "human"
        ? body.conversationKind
        : undefined,
      otherPartyName: typeof body.otherPartyName === "string" ? body.otherPartyName : undefined,
      userName: typeof body.userName === "string" ? body.userName : undefined,
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "failed to analyze reply" },
      { status: 500 }
    );
  }
}
