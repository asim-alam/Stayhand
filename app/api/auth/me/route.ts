import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getReplyUserBySession, REPLY_SESSION_COOKIE } from "@/lib/reply/messaging-service";

export const runtime = "nodejs";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(REPLY_SESSION_COOKIE)?.value;
  const user = await getReplyUserBySession(token);
  return NextResponse.json(
    { user, session: user ? token : null },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
