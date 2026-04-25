import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "node:crypto";
import { persistStoredMoment } from "@/lib/runtime/moments-store";
import { getReplyUserBySession, REPLY_SESSION_COOKIE } from "@/lib/reply/messaging-service";
import { buildFallbackAnalysis } from "@/lib/real-mode/reply-service";
import type { ReplyAnalyzeResult, UserActionType } from "@/lib/real-mode/types";
import type { StayhandMoment } from "@/lib/runtime/db";

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

    const moment: StayhandMoment = {
      id: crypto.randomUUID(),
      user_id: user.id,
      anonymous_session_id: null,
      surface: (body.surface as any) || "reply",
      created_at: new Date().toISOString(),
      title: body.conversationId ? `Reply to ${body.otherPartyName || "Unknown"}` : "Reply Moment",
      status: body.userAction === "cooled" ? "cooled" :
              body.userAction === "dismissed" || body.userAction === "sent_original" ? "dismissed" :
              "completed",
      trigger_reason: body.reviewData.why_appeared || "High heat detected",
      heat_before: body.reviewData.heat || null,
      heat_after: heatAfter ?? null,
      original_input: body.originalDraft || null,
      ai_review: body.reviewData.ai_review || body.reviewData.guidance || null,
      ai_suggestion: body.reviewData.try_message || null,
      final_output: finalMessage || null,
      user_action: body.userAction,
      payload_json: JSON.stringify(body.reviewData),
    };

    await persistStoredMoment(moment);

    return NextResponse.json({ success: true, outcomeId: moment.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "failed to log outcome" },
      { status: 400 }
    );
  }
}
