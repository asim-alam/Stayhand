import { generateBuyQuestion } from "@/lib/real-mode/buy-service";
import { createTextSseStream } from "@/lib/real-mode/sse";
import type { BuyProduct, BuyQuestionMessage } from "@/lib/real-mode/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
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
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "failed to generate question" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

