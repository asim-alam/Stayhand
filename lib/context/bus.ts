import type { TabActionResult, TabId, TabManifest, TabQueryResult } from "@/lib/types/runtime";
import { TabManifestRegistry } from "@/lib/context/registry";

export class AgentContextBus {
  constructor(private readonly registry: TabManifestRegistry) {}

  discover(): TabManifest[] {
    return this.registry.getAllManifests();
  }

  async queryTab(tabId: TabId, queryId: string, params: Record<string, unknown> = {}): Promise<TabQueryResult> {
    return this.registry.executeQuery(tabId, queryId, params);
  }

  async actOnTab(tabId: TabId, actionId: string, params: Record<string, unknown> = {}): Promise<TabActionResult> {
    return this.registry.executeAction(tabId, actionId, params);
  }

  async buildAmbientContext(): Promise<string[]> {
    const manifests = this.registry.getAllManifests();
    const sections: string[] = [];
    for (const manifest of manifests) {
      const snapshot = await this.registry.getSnapshot(manifest.id);
      if (snapshot) {
        sections.push(`[${manifest.name}] ${snapshot.summary}`);
      }
    }
    return sections;
  }
}
