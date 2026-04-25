export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { pluginRegistry } from "@/lib/plugins/registry";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    success: true,
    plugins: await pluginRegistry.getPlugins(),
  });
}
