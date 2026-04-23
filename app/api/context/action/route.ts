import { NextResponse } from "next/server";
import { runtimeService } from "@/lib/runtime/service";
import type { TabId } from "@/lib/types/runtime";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as { tabId?: TabId; actionId?: string; params?: Record<string, unknown> };
  if (!body.tabId || !body.actionId) {
    return NextResponse.json({ success: false, error: "tabId and actionId are required." }, { status: 400 });
  }
  const result = await runtimeService.getContextBus().actOnTab(body.tabId, body.actionId, body.params || {});
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
