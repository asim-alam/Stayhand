export const dynamic = "force-dynamic";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getStoredMoments } from "@/lib/runtime/moments-store";
import { getReplyUserBySession, REPLY_SESSION_COOKIE } from "@/lib/reply/messaging-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(REPLY_SESSION_COOKIE)?.value;
    const user = await getReplyUserBySession(token);
    const anonCookie = cookieStore.get("stayhand_local_session")?.value ?? null;

    const userId = user?.id ?? null;
    const anonSessionId = !userId ? anonCookie : null;

    if (!userId && !anonSessionId) {
      return NextResponse.json({ moments: [], total: 0 });
    }

    const { searchParams } = new URL(request.url);
    const surface = searchParams.get("surface") ?? undefined;
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 50, 200) : 50;

    const moments = await getStoredMoments(userId, anonSessionId, surface, limit);
    return NextResponse.json({ moments, total: moments.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "failed to load moments" },
      { status: 500 }
    );
  }
}
