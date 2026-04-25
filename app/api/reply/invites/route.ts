import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  createInvite,
  getReplyUserBySession,
  REPLY_SESSION_COOKIE,
} from "@/lib/reply/messaging-service";

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
    const invite = await createInvite(user);
    const origin = new URL(request.url).origin;
    return NextResponse.json({
      ...invite,
      url: `${origin}${invite.urlPath}`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "failed to create invite" },
      { status: 401 }
    );
  }
}
