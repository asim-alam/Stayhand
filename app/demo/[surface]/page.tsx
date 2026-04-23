import { notFound } from "next/navigation";
import { MomentExperience } from "@/components/demo/moment-experience";
import type { MomentSurface } from "@/lib/core/types";
import { listScenarios } from "@/lib/scenarios/catalog";

const SURFACES = new Set<MomentSurface>(["send", "buy", "reply"]);

export default async function DemoSurfacePage({
  params,
}: {
  params: Promise<{ surface: string }>;
}) {
  const { surface } = await params;
  if (!SURFACES.has(surface as MomentSurface)) {
    notFound();
  }

  return <MomentExperience surface={surface as MomentSurface} scenarios={listScenarios(surface as MomentSurface)} />;
}
