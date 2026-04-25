import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { clearReplySession, REPLY_SESSION_COOKIE } from "@/lib/reply/messaging-service";

export const runtime = "nodejs";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(REPLY_SESSION_COOKIE)?.value;
  await clearReplySession(token);
  cookieStore.set(REPLY_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(0),
  });
  return NextResponse.json({ ok: true });
}
