import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { persistStoredMoment } from "@/lib/runtime/moments-store";
import type { StayhandMoment } from "@/lib/runtime/db";
import { getReplyUserBySession, REPLY_SESSION_COOKIE } from "@/lib/reply/messaging-service";

export const runtime = "nodejs";

const VALID_SURFACES = ["reply", "send", "buy"] as const;
const VALID_ACTIONS = [
  "used_try", "edited_try", "sent_original", "dismissed", "cooled",
  "cooled_then_sent", "cooled_then_edited", "proceeded", "edited",
  "let_go", "bought", "waited", "decided_not_to_buy", "did_not_send",
] as const;

type ValidSurface = typeof VALID_SURFACES[number];
type ValidAction = typeof VALID_ACTIONS[number];

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(REPLY_SESSION_COOKIE)?.value;
    const user = await getReplyUserBySession(token);

    // Use anon session cookie as fallback for Send/Buy
    const anonCookie = cookieStore.get("stayhand_local_session")?.value ?? null;
    const userId = user?.id ?? null;
    const anonSessionId = !userId ? anonCookie : null;

    if (!userId && !anonSessionId) {
      return NextResponse.json({ error: "authentication required to log moments" }, { status: 401 });
    }

    const body = await request.json() as {
      surface?: unknown;
      title?: unknown;
      status?: unknown;
      trigger_reason?: unknown;
      heat_before?: unknown;
      heat_after?: unknown;
      original_input?: unknown;
      ai_review?: unknown;
      ai_suggestion?: unknown;
      final_output?: unknown;
      user_action?: unknown;
      payload?: unknown;
    };

    // Validate required fields
    const surface = body.surface as ValidSurface;
    if (!VALID_SURFACES.includes(surface)) {
      return NextResponse.json({ error: `surface must be one of: ${VALID_SURFACES.join(", ")}` }, { status: 400 });
    }

    const user_action = body.user_action as ValidAction;
    if (!VALID_ACTIONS.includes(user_action)) {
      return NextResponse.json({ error: `user_action must be one of: ${VALID_ACTIONS.join(", ")}` }, { status: 400 });
    }

    const title = typeof body.title === "string" && body.title.trim()
      ? body.title.trim().slice(0, 120)
      : `${surface} moment`;

    const status = ["completed", "dismissed", "cooled", "abandoned"].includes(body.status as string)
      ? (body.status as StayhandMoment["status"])
      : "completed";

    const moment: StayhandMoment = {
      id: crypto.randomUUID(),
      user_id: userId,
      anonymous_session_id: anonSessionId,
      surface,
      created_at: new Date().toISOString(),
      title,
      status,
      trigger_reason: typeof body.trigger_reason === "string" ? body.trigger_reason.slice(0, 200) : null,
      heat_before: typeof body.heat_before === "number" ? Math.round(body.heat_before) : null,
      heat_after: typeof body.heat_after === "number" ? Math.round(body.heat_after) : null,
      original_input: typeof body.original_input === "string" ? body.original_input.slice(0, 2000) : null,
      ai_review: typeof body.ai_review === "string" ? body.ai_review.slice(0, 1000) : null,
      ai_suggestion: typeof body.ai_suggestion === "string" ? body.ai_suggestion.slice(0, 2000) : null,
      final_output: typeof body.final_output === "string" ? body.final_output.slice(0, 2000) : null,
      user_action,
      payload_json: JSON.stringify(typeof body.payload === "object" && body.payload !== null ? body.payload : {}),
    };

    await persistStoredMoment(moment);
    return NextResponse.json({ ok: true, id: moment.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "failed to log moment" },
      { status: 500 }
    );
  }
}
