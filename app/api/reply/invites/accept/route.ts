import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { broadcastReplyEvent } from "@/lib/reply/broadcast";
import {
  acceptInvite,
  getActiveSessionTokensForUsers,
  getConversationParticipantIds,
  getReplyUserBySession,
  REPLY_SESSION_COOKIE,
} from "@/lib/reply/messaging-service";

export const runtime = "nodejs";

async function requireUser() {
  const cookieStore = await cookies();
  const user = getReplyUserBySession(cookieStore.get(REPLY_SESSION_COOKIE)?.value);
  if (!user) throw new Error("sign in required");
  return user;
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as { token?: string };
    if (typeof body.token !== "string" || !body.token.trim()) {
      return NextResponse.json({ error: "token is required" }, { status: 400 });
    }
    const conversation = acceptInvite(user, body.token);
    const participantIds = getConversationParticipantIds(conversation.id);
    const sessionTokens = getActiveSessionTokensForUsers(participantIds);
    broadcastReplyEvent(sessionTokens, {
      type: "invite.accepted",
      conversation,
    });
    return NextResponse.json({ conversation });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "failed to accept invite" },
      { status: 400 }
    );
  }
}
