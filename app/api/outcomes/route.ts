import { NextResponse } from "next/server";
import { getMessageOutcomes } from "@/lib/runtime/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : 50;
    
    const outcomes = getMessageOutcomes(limit);
    return NextResponse.json({ outcomes });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "failed to load outcomes" },
      { status: 500 }
    );
  }
}
