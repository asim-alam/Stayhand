import { NextResponse } from "next/server";
import { analyzeSendMoment } from "@/lib/real-mode/send-service";
import { cookies } from "next/headers";
import { getReplyUserBySession, REPLY_SESSION_COOKIE } from "@/lib/reply/messaging-service";

export const runtime = "nodejs";

async function requireUser() {
  const cookieStore = await cookies();
  const user = await getReplyUserBySession(cookieStore.get(REPLY_SESSION_COOKIE)?.value);
  if (!user) throw new Error("sign in required");
  return user;
}

export async function POST(request: Request) {
  try {
    await requireUser();
    const body = await request.json() as {
      draft?: string;
      context?: string;
      type?: string;
      tone?: string;
      amount?: number;
    };

    const draft = typeof body.draft === "string" ? body.draft : "";
    if (!draft.trim()) {
      return NextResponse.json({ error: "draft is required" }, { status: 400 });
    }

    const surface = body.type === "buy" ? "buy" : "send";

    const response = await analyzeSendMoment({
      surface,
      draft,
      context: typeof body.context === "string" ? body.context : undefined,
      amount: typeof body.amount === "number" ? body.amount : undefined,
      type: typeof body.type === "string" ? body.type : undefined,
      tone: typeof body.tone === "string" ? body.tone : undefined,
    });

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to analyze send draft";
    const status = message === "sign in required" ? 401 : 500;
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}

