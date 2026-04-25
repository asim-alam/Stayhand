import { NextResponse } from "next/server";
import { generateBuyVerdict } from "@/lib/real-mode/buy-service";
import type { BuyProduct, BuyQuestionMessage } from "@/lib/real-mode/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "failed to compute verdict" },
      { status: 500 }
    );
  }
}

