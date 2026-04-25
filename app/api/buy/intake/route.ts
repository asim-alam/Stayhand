import { NextResponse } from "next/server";
import { intakeBuyDecision } from "@/lib/real-mode/buy-service";
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
    const body = await request.json() as { input?: string };
    if (typeof body.input !== "string" || !body.input.trim()) {
      return NextResponse.json({ error: "input is required" }, { status: 400 });
    }

    const response = await intakeBuyDecision(body.input);
    return NextResponse.json({ success: true, ...response });
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to intake purchase";
    const status = message === "sign in required" ? 401 : 500;
    return NextResponse.json(
      { success: false, error: message },
      { status }
    );
  }
}

