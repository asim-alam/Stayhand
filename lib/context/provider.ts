import type { TabActionResult, TabManifest, TabQueryResult, TabSnapshot } from "@/lib/types/runtime";

export interface TabDataProvider {
  getManifest(): TabManifest;
  getSnapshot(): Promise<TabSnapshot>;
  executeQuery(queryId: string, params?: Record<string, unknown>): Promise<TabQueryResult>;
  executeAction(actionId: string, params?: Record<string, unknown>): Promise<TabActionResult>;
}
