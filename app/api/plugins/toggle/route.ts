import { NextResponse } from "next/server";
import { pluginRegistry } from "@/lib/plugins/registry";
import { runtimeService } from "@/lib/runtime/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as { id?: string; enabled?: boolean };
  if (!body.id || typeof body.enabled !== "boolean") {
    return NextResponse.json({ success: false, error: "id and enabled are required." }, { status: 400 });
  }
  const plugin = await pluginRegistry.toggle(body.id, body.enabled);
  runtimeService.publish({ type: "plugins", payload: await pluginRegistry.getPlugins() });
  return NextResponse.json({
    success: Boolean(plugin),
    plugin,
    plugins: await pluginRegistry.getPlugins(),
  });
}
