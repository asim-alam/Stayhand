import { generateBuyQuestion } from "@/lib/real-mode/buy-service";
import { createTextSseStream } from "@/lib/real-mode/sse";
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
      history?: BuyQuestionMessage[];
      questionIndex?: number;
    };

    if (!body.product || typeof body.product.title !== "string") {
      return new Response(JSON.stringify({ error: "product is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const history = Array.isArray(body.history)
      ? body.history.filter((message): message is BuyQuestionMessage => {
          return Boolean(
            message
            && (message.role === "assistant" || message.role === "user")
            && typeof message.content === "string"
          );
        })
      : [];

    const questionIndex = typeof body.questionIndex === "number" ? body.questionIndex : 0;
    const response = await generateBuyQuestion(body.product, history, questionIndex);
    const stream = createTextSseStream(response.result.question);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to generate question";
    const status = message === "sign in required" ? 401 : 500;
    return new Response(
      JSON.stringify({ error: message }),
      {
        status,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

