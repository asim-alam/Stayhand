import { NextResponse } from "next/server";
import { generateBuyVerdict } from "@/lib/real-mode/buy-service";
import type { BuyProduct, BuyQuestionMessage } from "@/lib/real-mode/types";
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
    const body = await request.json() as {
      product?: BuyProduct;
      transcript?: BuyQuestionMessage[];
    };

    if (!body.product || typeof body.product.title !== "string") {
      return NextResponse.json({ error: "product is required" }, { status: 400 });
    }

    const transcript = Array.isArray(body.transcript)
      ? body.transcript.filter((message): message is BuyQuestionMessage => {
          return Boolean(
            message
            && (message.role === "assistant" || message.role === "user")
            && typeof message.content === "string"
          );
        })
      : [];

    const response = await generateBuyVerdict(body.product, transcript);
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to compute verdict";
    const status = message === "sign in required" ? 401 : 500;
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}

