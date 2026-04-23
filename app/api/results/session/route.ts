import { NextResponse } from "next/server";
import { demoService } from "@/lib/core/demo-service";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ success: true, result: demoService.getResults() });
}
