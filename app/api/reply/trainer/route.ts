import { NextResponse } from "next/server";
import { trainerNext, trainerCoach, type Turn } from "@/lib/real-mode/trainer-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      intent?: string;
      history?: Turn[];
      draft?: string;
    };

    const intent = body.intent;
    const history: Turn[] = Array.isArray(body.history)
      ? body.history.filter(
          (t): t is Turn =>
            typeof t === "object" &&
            t !== null &&
            (t.role === "alex" || t.role === "user") &&
            typeof t.body === "string"
        )
      : [];

    if (intent === "next") {
      const result = await trainerNext(history);
      return NextResponse.json(result);
    }

    if (intent === "coach") {
      const draft = typeof body.draft === "string" ? body.draft : "";
      if (!draft.trim()) {
        return NextResponse.json({ comment: "", suggestion: "" });
      }
      const result = await trainerCoach(history, draft);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "intent must be 'next' or 'coach'" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "trainer request failed" },
      { status: 500 }
    );
  }
}
