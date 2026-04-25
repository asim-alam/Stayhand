import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  getReplyUserBySession,
  listConversations,
  openBotConversation,
  REPLY_SESSION_COOKIE,
} from "@/lib/reply/messaging-service";

export const runtime = "nodejs";

async function requireUser() {
  const cookieStore = await cookies();
  const user = await getReplyUserBySession(cookieStore.get(REPLY_SESSION_COOKIE)?.value);
  if (!user) throw new Error("sign in required");
  return user;
}

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json({ conversations: await listConversations(user.id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "failed" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json() as { botId?: string };
    if (typeof body.botId !== "string") {
      return NextResponse.json({ error: "botId is required" }, { status: 400 });
    }
    const conversation = await openBotConversation(user.id, body.botId);
    return NextResponse.json({ conversation });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "failed" }, { status: 400 });
  }
}
