import { notFound } from "next/navigation";
import { BuyLiveDemo } from "@/components/demo/buy-live-demo";
import { MomentExperience } from "@/components/demo/moment-experience";
import { ReplyLiveDemo } from "@/components/demo/reply-live-demo";
import { SendLiveDemo } from "@/components/demo/send-live-demo";
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

  if (surface === "buy") {
    return <BuyLiveDemo />;
  }

  if (surface === "reply") {
    return <ReplyLiveDemo />;
  }

  if (surface === "send") {
    return <SendLiveDemo />;
  }

  return <MomentExperience surface={surface as MomentSurface} scenarios={listScenarios(surface as MomentSurface)} />;
}
