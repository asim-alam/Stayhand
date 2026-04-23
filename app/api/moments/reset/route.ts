import { NextResponse } from "next/server";
import { demoService } from "@/lib/core/demo-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as { judgeMode?: boolean } | null;
  const result = demoService.reset(Boolean(body?.judgeMode));
  return NextResponse.json({ success: true, result });
}
