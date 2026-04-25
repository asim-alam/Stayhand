import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { broadcastReplyEvent } from "@/lib/reply/broadcast";
import {
  getActiveSessionTokensForUsers,
  getConversationParticipantIds,
  getReplyUserBySession,
  listMessages,
  REPLY_SESSION_COOKIE,
  sendReplyMessage,
  type ReplyFrictionMeta,
} from "@/lib/reply/messaging-service";
import { persistMessageOutcome } from "@/lib/runtime/db";
import type { MessageOutcome } from "@/lib/real-mode/types";

export const runtime = "nodejs";

async function requireUser() {
  const cookieStore = await cookies();
  const user = getReplyUserBySession(cookieStore.get(REPLY_SESSION_COOKIE)?.value);
  if (!user) throw new Error("sign in required");
  return user;
}

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const conversationId = url.searchParams.get("conversationId");
    if (!conversationId) {
      return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
    }
    return NextResponse.json(listMessages(user.id, conversationId));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "failed to load messages" },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json() as {
      conversationId?: string;
      body?: string;
      friction?: ReplyFrictionMeta;
      outcome?: MessageOutcome;
    };
    if (typeof body.conversationId !== "string" || typeof body.body !== "string" || !body.body.trim()) {
      return NextResponse.json({ error: "conversationId and body are required" }, { status: 400 });
    }
    const result = await sendReplyMessage(user, body.conversationId, body.body, body.friction ?? {});
    
    if (body.outcome) {
      persistMessageOutcome(body.outcome);
    }
    
    const participantIds = getConversationParticipantIds(body.conversationId);
    const sessionTokens = getActiveSessionTokensForUsers(participantIds);
    broadcastReplyEvent(sessionTokens, {
      type: "message.created",
      conversationId: body.conversationId,
      messages: result.created,
      conversation: result.conversation,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "failed to send message" },
      { status: 400 }
    );
  }
}
