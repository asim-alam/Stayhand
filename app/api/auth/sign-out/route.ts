import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { clearReplySession, REPLY_SESSION_COOKIE } from "@/lib/reply/messaging-service";

export const runtime = "nodejs";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(REPLY_SESSION_COOKIE)?.value;
  clearReplySession(token);
  cookieStore.delete(REPLY_SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
