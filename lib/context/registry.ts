import type { TabManifest, TabId, TabActionResult, TabQueryResult, TabSnapshot } from "@/lib/types/runtime";
import type { TabDataProvider } from "@/lib/context/provider";

export class TabManifestRegistry {
  private manifests = new Map<TabId, TabManifest>();
  private providers = new Map<TabId, TabDataProvider>();

  register(provider: TabDataProvider): void {
    const manifest = provider.getManifest();
    this.manifests.set(manifest.id, manifest);
    this.providers.set(manifest.id, provider);
  }

  getManifest(tabId: TabId): TabManifest | undefined {
    return this.manifests.get(tabId);
  }

  getAllManifests(): TabManifest[] {
    return [...this.manifests.values()];
  }

  async executeQuery(tabId: TabId, queryId: string, params: Record<string, unknown> = {}): Promise<TabQueryResult> {
    const provider = this.providers.get(tabId);
    if (!provider) {
      return {
        success: false,
        data: null,
        formatted: `[${tabId}] provider is unavailable`,
        tokenCount: 8,
        timestamp: Date.now(),
      };
    }
    return provider.executeQuery(queryId, params);
  }

  async executeAction(tabId: TabId, actionId: string, params: Record<string, unknown> = {}): Promise<TabActionResult> {
    const provider = this.providers.get(tabId);
    if (!provider) {
      return {
        success: false,
        message: `[${tabId}] provider is unavailable`,
      };
    }
    return provider.executeAction(actionId, params);
  }

  async getSnapshot(tabId: TabId): Promise<TabSnapshot | null> {
    const provider = this.providers.get(tabId);
    return provider ? provider.getSnapshot() : null;
  }
}
