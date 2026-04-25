import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getMessageOutcomes } from "@/lib/runtime/db";
import { getReplyUserBySession, REPLY_SESSION_COOKIE } from "@/lib/reply/messaging-service";

export const runtime = "nodejs";

async function requireUser() {
  const cookieStore = await cookies();
  const user = await getReplyUserBySession(cookieStore.get(REPLY_SESSION_COOKIE)?.value);
  if (!user) throw new Error("sign in required");
  return user;
}

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : 50;
    
    const outcomes = getMessageOutcomes(user.id, limit);
    return NextResponse.json({ outcomes });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "failed to load outcomes" },
      { status: 500 }
    );
  }
}

