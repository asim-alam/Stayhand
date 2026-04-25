export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { mcpService } from "@/lib/mcp/service";

export const runtime = "nodejs";

export async function GET() {
  const tools = await mcpService.listAllTools();
  return NextResponse.json({
    success: true,
    tools,
    count: tools.length,
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { tool?: string; args?: Record<string, unknown> };
  if (!body.tool) {
    return NextResponse.json({ success: false, error: "tool is required." }, { status: 400 });
  }
  const result = await mcpService.executeTool(body.tool, body.args || {});
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
