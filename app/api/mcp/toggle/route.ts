import { NextResponse } from "next/server";
import { mcpService } from "@/lib/mcp/service";
import { runtimeService } from "@/lib/runtime/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as { name?: string };
  if (!body.name) {
    return NextResponse.json({ success: false, error: "name is required." }, { status: 400 });
  }
  const result = await mcpService.toggleServer(body.name);
  runtimeService.publish({ type: "mcp", payload: await mcpService.getServers() });
  return NextResponse.json({
    success: result.success,
    running: result.running,
    error: result.error,
    servers: await mcpService.getServers(),
  });
}
