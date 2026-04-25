import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "node:crypto";
import { persistMessageOutcome } from "@/lib/runtime/db";
import { getReplyUserBySession, REPLY_SESSION_COOKIE } from "@/lib/reply/messaging-service";
import { buildFallbackAnalysis } from "@/lib/real-mode/reply-service";
import type { MessageOutcome, ReplyAnalyzeResult, UserActionType } from "@/lib/real-mode/types";

export const runtime = "nodejs";

async function requireUser() {
  const cookieStore = await cookies();
  const user = await getReplyUserBySession(cookieStore.get(REPLY_SESSION_COOKIE)?.value);
  if (!user) throw new Error("sign in required");
  return user;
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json() as {
      userAction?: UserActionType;
      originalDraft?: string;
      finalMessage?: string;
      reviewData?: ReplyAnalyzeResult;
      conversationId?: string;
      otherPartyName?: string;
      latestIncomingMessage?: string;
      surface?: string;
    };

    if (!body.userAction || !body.reviewData || !body.conversationId) {
      return NextResponse.json({ error: "missing required outcome fields" }, { status: 400 });
    }

    const finalMessage = body.finalMessage ?? body.originalDraft ?? "";

    // Server-side calculation of heat_after
    let heatAfter = body.reviewData.heat;
    if (finalMessage !== body.originalDraft) {
      const heuristic = buildFallbackAnalysis({
        draft: finalMessage,
        incomingMessage: body.latestIncomingMessage,
        userName: user.displayName,
        otherPartyName: body.otherPartyName,
      });
      heatAfter = heuristic.heat;
    }

    let outcomeSummary = "";
    if (body.userAction === "used_try") outcomeSummary = "User accepted the Try suggestion.";
    else if (body.userAction === "edited_try") outcomeSummary = "User edited the suggestion before sending.";
    else if (body.userAction === "sent_original") outcomeSummary = "User sent their original draft despite friction.";
    else if (body.userAction === "dismissed") outcomeSummary = "User dismissed the coach and continued writing.";
    else if (body.userAction === "cooled") outcomeSummary = "User chose to cool down the message for later.";
    else outcomeSummary = "Moment recorded.";

    const outcome: MessageOutcome = {
      id: crypto.randomUUID(),
      surface: body.surface || "reply",
      user_id: user.id,
      conversation_id: body.conversationId,
      other_person_name: body.otherPartyName || "Unknown",
      user_name: user.displayName,
      timestamp: new Date().toISOString(),
      latest_incoming_message: body.latestIncomingMessage || "",
      user_draft: body.originalDraft || "",
      ai_review: body.reviewData.ai_review || body.reviewData.guidance || "No review",
      why_appeared: body.reviewData.why_appeared || "High heat detected",
      warning_badge: body.reviewData.warning_badge || null,
      reply_type: body.reviewData.reply_type || "other",
      issue_type: body.reviewData.issue_type || "none",
      heat_before: body.reviewData.heat || 0,
      heat_after: heatAfter,
      try_message: body.reviewData.try_message || "",
      final_sent_message: finalMessage,
      user_action: body.userAction,
      outcome_summary: outcomeSummary,
    };

    persistMessageOutcome(outcome);

    return NextResponse.json({ success: true, outcomeId: outcome.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "failed to log outcome" },
      { status: 400 }
    );
  }
}
