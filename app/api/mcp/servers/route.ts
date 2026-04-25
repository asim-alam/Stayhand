export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { mcpService } from "@/lib/mcp/service";
import { runtimeService } from "@/lib/runtime/service";
import type { MCPServerConfig } from "@/lib/types/runtime";

export const runtime = "nodejs";

export async function GET() {
  const servers = await mcpService.getServers();
  return NextResponse.json({
    success: true,
    servers,
    runningCount: mcpService.getRunningCount(),
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as MCPServerConfig;
  const result = await mcpService.addServer(body);
  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }
  runtimeService.publish({ type: "mcp", payload: await mcpService.getServers() });
  return NextResponse.json({ success: true, servers: await mcpService.getServers() });
}

export async function DELETE(request: Request) {
  const body = (await request.json()) as { name?: string };
  if (!body.name) {
    return NextResponse.json({ success: false, error: "name is required." }, { status: 400 });
  }
  const result = await mcpService.removeServer(body.name);
  runtimeService.publish({ type: "mcp", payload: await mcpService.getServers() });
  return NextResponse.json({ success: result.success, error: result.error, servers: await mcpService.getServers() });
}
