import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { broadcastReplyEvent } from "@/lib/reply/broadcast";
import {
  getActiveSessionTokensForUsers,
  getConversationParticipantIds,
  getReplyUserBySession,
  invalidateConversationCache,
  listMessages,
  REPLY_SESSION_COOKIE,
  sendReplyMessage,
  type ReplyFrictionMeta,
} from "@/lib/reply/messaging-service";
import { persistMessageOutcome } from "@/lib/runtime/db";
import { buildFallbackAnalysis } from "@/lib/real-mode/reply-service";
import type { MessageOutcome, ReplyAnalyzeResult, UserActionType } from "@/lib/real-mode/types";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

async function requireUser() {
  const cookieStore = await cookies();
  const user = await getReplyUserBySession(cookieStore.get(REPLY_SESSION_COOKIE)?.value);
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
    return NextResponse.json(await listMessages(user.id, conversationId));
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
      outcomeData?: {
        userAction: UserActionType;
        originalDraft: string;
        reviewData: ReplyAnalyzeResult;
        otherPartyName: string;
        latestIncomingMessage: string;
      };
    };
    if (typeof body.conversationId !== "string" || typeof body.body !== "string" || !body.body.trim()) {
      return NextResponse.json({ error: "conversationId and body are required" }, { status: 400 });
    }
    if (
      body.outcomeData &&
      (
        typeof body.outcomeData.originalDraft !== "string" ||
        !body.outcomeData.reviewData ||
        typeof body.outcomeData.reviewData.ai_review !== "string" ||
        typeof body.outcomeData.reviewData.try_message !== "string"
      )
    ) {
      return NextResponse.json({ error: "invalid AI review payload" }, { status: 400 });
    }
    const result = await sendReplyMessage(user, body.conversationId, body.body, body.friction ?? {});
    
    if (body.outcomeData) {
      const finalMessage = body.body;
      let heatAfter = body.outcomeData.reviewData.heat;
      if (finalMessage !== body.outcomeData.originalDraft) {
        const heuristic = buildFallbackAnalysis({
          draft: finalMessage,
          incomingMessage: body.outcomeData.latestIncomingMessage,
          userName: user.displayName,
          otherPartyName: body.outcomeData.otherPartyName,
        });
        heatAfter = heuristic.heat;
      }

      let outcomeSummary = "";
      if (body.outcomeData.userAction === "used_try") outcomeSummary = "User accepted the Try suggestion.";
      else if (body.outcomeData.userAction === "edited_try") outcomeSummary = "User edited the suggestion before sending.";
      else if (body.outcomeData.userAction === "sent_original") outcomeSummary = "User sent their original draft despite friction.";
      else if (body.outcomeData.userAction === "cooled") outcomeSummary = "User cooled the message before sending.";
      else outcomeSummary = "Message sent with coaching.";

      const outcome: MessageOutcome = {
        id: crypto.randomUUID(),
        surface: "reply",
        user_id: user.id,
        conversation_id: body.conversationId,
        other_person_name: body.outcomeData.otherPartyName || "Unknown",
        user_name: user.displayName,
        timestamp: new Date().toISOString(),
        latest_incoming_message: body.outcomeData.latestIncomingMessage || "",
        user_draft: body.outcomeData.originalDraft || "",
        ai_review: body.outcomeData.reviewData.ai_review || body.outcomeData.reviewData.guidance || "No review",
        why_appeared: body.outcomeData.reviewData.why_appeared || "High heat detected",
        warning_badge: body.outcomeData.reviewData.warning_badge || null,
        reply_type: body.outcomeData.reviewData.reply_type || "other",
        issue_type: body.outcomeData.reviewData.issue_type || "none",
        heat_before: body.outcomeData.reviewData.heat || 0,
        heat_after: heatAfter,
        try_message: body.outcomeData.reviewData.try_message || "",
        final_sent_message: finalMessage,
        user_action: body.outcomeData.userAction,
        outcome_summary: outcomeSummary,
      };

      persistMessageOutcome(outcome);
    }
    
    const participantIds = await getConversationParticipantIds(body.conversationId);
    const sessionTokens = await getActiveSessionTokensForUsers(participantIds);
    // Bust the conversation list cache so the next poll returns fresh data
    invalidateConversationCache(participantIds);
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
