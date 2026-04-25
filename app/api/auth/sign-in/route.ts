import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { REPLY_SESSION_COOKIE, signInReplyUser, type ReplyAuthMode } from "@/lib/reply/messaging-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { displayName?: string; passcode?: string; mode?: ReplyAuthMode };
    const result = await signInReplyUser(
      typeof body.displayName === "string" ? body.displayName : "",
      typeof body.passcode === "string" ? body.passcode : "",
      body.mode === "create" || body.mode === "sign-in" ? body.mode : "auto"
    );

    const cookieStore = await cookies();
    cookieStore.set(REPLY_SESSION_COOKIE, result.token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 30,
      expires: new Date(result.expiresAt),
    });

    return NextResponse.json({ user: result.user, session: result.token });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "sign in failed" },
      { status: 400 }
    );
  }
}
