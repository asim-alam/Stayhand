import { BUILTIN_CONNECTORS, createBuiltinEvent } from "@/lib/adapters/builtin";
import { AgentContextBus } from "@/lib/context/bus";
import type { TabDataProvider } from "@/lib/context/provider";
import { TabManifestRegistry } from "@/lib/context/registry";
import { buildLedgerEntry, evaluateEvent } from "@/lib/friction/evaluator";
import { mcpService } from "@/lib/mcp/service";
import { pluginRegistry } from "@/lib/plugins/registry";
import { getLedgerEntries, persistLedgerEntry } from "@/lib/runtime/db";
import { createId, createTraceEntry, nowIso } from "@/lib/runtime/utils";
import type {
  BootstrapPayload,
  ConnectorRecord,
  FrictionEvent,
  FrictionMode,
  LedgerEntry,
  TabActionResult,
  TabId,
  TabManifest,
  TabQueryResult,
  TabSnapshot,
  WorkspacePayload,
  WorkspaceStats,
} from "@/lib/types/runtime";

type RuntimeUpdate =
  | { type: "bootstrap"; payload: BootstrapPayload }
  | { type: "queue"; payload: FrictionEvent }
  | { type: "event"; payload: FrictionEvent }
  | { type: "plugins"; payload: unknown }
  | { type: "connectors"; payload: unknown }
  | { type: "mcp"; payload: unknown };

const POLICIES: Array<{ id: string; mode: FrictionMode; title: string; trigger: string; action: string }> = [
  {
    id: "shield-policy",
    mode: "shield",
    title: "Financial Shield",
    trigger: "Recipient trust fails or urgency tries to bypass verification.",
    action: "Hold or block the action before value leaves the system.",
  },
  {
    id: "kiln-policy",
    mode: "kiln",
    title: "Heat and Harm",
    trigger: "Message heat crosses the escalation threshold.",
    action: "Route through cooling, softened copy, or apology fast lane.",
  },
  {
    id: "quarry-policy",
    mode: "quarry",
    title: "Creative Interrogation",
    trigger: "The request is under-specified and likely to yield generic output.",
    action: "Ask sharper questions and force contrasting directions.",
  },
  {
    id: "lab-policy",
    mode: "lab",
    title: "Autopilot Lab",
    trigger: "Drift, overload, or low-energy patterns start shaping behavior.",
    action: "Prescribe friction at the pattern level.",
  },
];

const COMMAND_PRESETS = [
  "What deserves friction right now?",
  "Explain the safest next action for the selected event.",
  "Which connector is drifting out of trust?",
  "Summarize operator posture across the workspace.",
];

class RuntimeProvider implements TabDataProvider {
  constructor(
    private readonly manifest: TabManifest,
    private readonly runtime: RuntimeService,
    private readonly queryHandler: (queryId: string, params: Record<string, unknown>) => Promise<TabQueryResult>,
    private readonly actionHandler: (actionId: string, params: Record<string, unknown>) => Promise<TabActionResult>,
    private readonly snapshotHandler: () => Promise<TabSnapshot>
  ) {}

  getManifest(): TabManifest {
    return this.manifest;
  }

  getSnapshot(): Promise<TabSnapshot> {
    return this.snapshotHandler();
  }

  executeQuery(queryId: string, params: Record<string, unknown> = {}): Promise<TabQueryResult> {
    return this.queryHandler(queryId, params);
  }

  executeAction(actionId: string, params: Record<string, unknown> = {}): Promise<TabActionResult> {
    return this.actionHandler(actionId, params);
  }
}

export class RuntimeService {
  private static instance: RuntimeService | null = null;
  private readonly registry = new TabManifestRegistry();
  private readonly contextBus = new AgentContextBus(this.registry);
  private readonly builtins = new Map<string, ConnectorRecord>(BUILTIN_CONNECTORS.map((connector) => [connector.id, { ...connector }]));
  private readonly queue: FrictionEvent[] = [];
  private readonly listeners = new Set<(update: RuntimeUpdate) => void>();
  private ledger: LedgerEntry[] = [];
  private initialized = false;
  private initializing: Promise<void> | null = null;
  private readonly workspaceId = "stayhand-ops";

  static getInstance(): RuntimeService {
    if (!RuntimeService.instance) {
      RuntimeService.instance = new RuntimeService();
    }
    return RuntimeService.instance;
  }

  private constructor() {
    this.registerProviders();
  }

  subscribe(listener: (update: RuntimeUpdate) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async bootstrap(selectedEventId?: string, selectedConnectorId?: string): Promise<BootstrapPayload> {
    await this.ensureInitialized();
    return {
      workspace: await this.getWorkspace(),
      stats: await this.getStats(),
      connectors: await this.getConnectors(),
      mcpServers: await mcpService.getServers(),
      plugins: await pluginRegistry.getPlugins(),
      queue: this.getQueue(),
      ledger: this.ledger.slice(0, 20),
      policies: POLICIES,
      manifests: this.registry.getAllManifests(),
      commandPresets: COMMAND_PRESETS,
      ambientContext: await this.contextBus.buildAmbientContext(),
      selectedPacket: await this.getSelectionPacket(selectedEventId, selectedConnectorId),
    };
  }

  getQueue(): FrictionEvent[] {
    return [...this.queue].sort((left, right) => {
      if (left.status !== right.status) {
        return left.status === "resolved" ? 1 : -1;
      }
      if (left.evaluation.tier !== right.evaluation.tier) {
        return right.evaluation.tier - left.evaluation.tier;
      }
      return new Date(right.receivedAt).getTime() - new Date(left.receivedAt).getTime();
    });
  }

  getLedger(): LedgerEntry[] {
    return this.ledger.slice(0, 20);
  }

  findEvent(eventId: string | undefined): FrictionEvent | null {
    if (!eventId) {
      return null;
    }
    return this.queue.find((event) => event.id === eventId) || null;
  }

  async getConnectors(): Promise<ConnectorRecord[]> {
    await this.ensureInitialized();
    const mcpStatuses = await mcpService.getServers();
    const mcpConnectors: ConnectorRecord[] = mcpStatuses.map((status) => ({
      id: `mcp:${status.name}`,
      sourceType: "mcp",
      name: status.name,
      category: "mcp",
      protocol: "mcp",
      transport: status.config?.type || "http",
      trustMode: "tooling",
      description: "External MCP server managed inside Stayhand.",
      snapshot: status.running
        ? `${status.tools.length} tool${status.tools.length === 1 ? "" : "s"} available.`
        : status.error || "Configured but not running.",
      supports: status.tools.map((tool) => tool.name).slice(0, 6),
      connected: status.running,
      health: status.running ? "live" : "offline",
      owner: "MCP",
      lastSync: status.running ? nowIso() : null,
      latencyMs: status.running ? 140 : 0,
      reliability: status.running ? 96 : 0,
      volume: status.running ? "variable" : "idle",
      auth: status.config?.type === "stdio" ? "local process" : "remote endpoint",
      recentEvents: this.queue.filter((event) => event.sourceId === `mcp:${status.name}`).slice(0, 3),
      recentLedger: this.ledger.filter((entry) => entry.sourceId === `mcp:${status.name}`).slice(0, 3),
      history: [],
    }));

    const builtins = [...this.builtins.values()].map((connector) => ({
      ...connector,
      queueDepth: this.queue.filter((event) => event.sourceId === connector.id && event.status !== "resolved").length,
      recentEvents: this.queue.filter((event) => event.sourceId === connector.id).slice(0, 3),
      recentLedger: this.ledger.filter((entry) => entry.sourceId === connector.id).slice(0, 3),
    }));

    return [...builtins, ...mcpConnectors];
  }

  async getStats(): Promise<WorkspaceStats> {
    const connectors = await this.getConnectors();
    const protectedValue = this.ledger.reduce((sum, entry) => sum + Number(entry.saved || 0), 0);
    const quotientEntries = this.ledger.filter((entry) => typeof entry.quotient === "number");
    return {
      connectedConnectors: connectors.filter((connector) => connector.connected).length,
      queueDepth: this.queue.filter((event) => event.status !== "resolved").length,
      hotQueue: this.queue.filter((event) => event.status !== "resolved" && event.evaluation.tier >= 2).length,
      protectedValue,
      cooledMessages: this.ledger.filter((entry) => entry.mode === "kiln").length,
      avgQuotient: quotientEntries.length
        ? Math.round(quotientEntries.reduce((sum, entry) => sum + Number(entry.quotient || 0), 0) / quotientEntries.length)
        : 48,
      pluginsEnabled: (await pluginRegistry.getPlugins()).filter((plugin) => plugin.enabled).length,
      runningMcpServers: (await mcpService.getServers()).filter((server) => server.running).length,
    };
  }

  async getWorkspace(): Promise<WorkspacePayload> {
    const stats = await this.getStats();
    const posture = stats.hotQueue >= 3 ? "Under Load" : stats.queueDepth >= 3 ? "Watchful" : "Protected";
    return {
      id: this.workspaceId,
      name: "Stayhand",
      operator: "BMCT LTD",
      posture,
      headline:
        posture === "Under Load"
          ? "Incoming pressure is outrunning the current friction posture."
          : posture === "Watchful"
            ? "The system is stable, but a few moments need operator attention."
            : "Judgment is holding despite real-time pressure.",
      narrative:
        posture === "Under Load"
          ? "Multiple hot signals are active at once. The workspace should escalate friction before convenience wins."
          : posture === "Watchful"
            ? "Some live moments need attention, but the system is still containing risk."
            : "Built-in adapters and active controls are keeping the workspace inside safe operating limits.",
    };
  }

  async simulateDemoEvent(sourceId?: string): Promise<FrictionEvent> {
    await this.ensureInitialized();
    const connectors = await this.getConnectors();
    const connector =
      connectors.find((item) => item.id === sourceId && item.connected) ||
      connectors.find((item) => item.connected) ||
      connectors[0];

    const event = connector.sourceType === "builtin"
      ? createBuiltinEvent(this.builtins.get(connector.id)!)
      : this.createMcpDemoEvent(connector.id, connector.name);

    this.queue.unshift(event);
    this.publish({ type: "queue", payload: event });
    return event;
  }

  evaluateEvent(eventId: string): FrictionEvent | null {
    const event = this.findEvent(eventId);
    if (!event) {
      return null;
    }
    event.evaluation = evaluateEvent(event);
    event.status = event.status === "resolved" ? "resolved" : "review";
    event.trace.push(
      createTraceEntry(
        "decision",
        event.evaluation.headline,
        event.evaluation.recommendation,
        event.evaluation.lane === "intervention" ? "warning" : event.evaluation.lane === "green" ? "positive" : "neutral"
      )
    );
    this.publish({ type: "event", payload: event });
    return event;
  }

  applyIntervention(eventId: string, action: string): { event: FrictionEvent; ledgerEntry: LedgerEntry } | null {
    const event = this.findEvent(eventId);
    if (!event) {
      return null;
    }
    event.status = "resolved";
    event.resolution = action;
    event.resolvedAt = nowIso();
    event.outcomeHeadline = `${event.evaluation.mode.toUpperCase()} / ${action}`;
    event.trace.push(createTraceEntry("resolved", event.outcomeHeadline, `Intervention applied: ${action}`, action === "release" ? "neutral" : "positive"));

    const ledgerEntry = buildLedgerEntry(event, action);
    persistLedgerEntry(ledgerEntry);
    this.ledger.unshift(ledgerEntry);
    this.ledger = this.ledger.slice(0, 50);
    this.publish({ type: "event", payload: event });
    return { event, ledgerEntry };
  }

  async toggleBuiltinConnector(id: string): Promise<ConnectorRecord | null> {
    const connector = this.builtins.get(id);
    if (!connector) {
      return null;
    }
    connector.connected = !connector.connected;
    connector.health = connector.connected ? "live" : "offline";
    connector.lastSync = connector.connected ? nowIso() : null;
    connector.history = connector.history || [];
    connector.history.unshift({
      id: createId("history"),
      at: nowIso(),
      title: connector.connected ? "Connector enabled" : "Connector disabled",
      detail: connector.connected ? `${connector.name} is live.` : `${connector.name} is offline.`,
    });
    connector.history = connector.history.slice(0, 8);
    this.publish({ type: "connectors", payload: await this.getConnectors() });
    return connector;
  }

  async getSelectionPacket(eventId?: string, connectorId?: string): Promise<Record<string, unknown> | null> {
    const event = this.findEvent(eventId);
    const connectors = await this.getConnectors();
    const connector = connectors.find((item) => item.id === (connectorId || event?.sourceId));
    return {
      event,
      connector,
      stats: await this.getStats(),
      ambientContext: await this.contextBus.buildAmbientContext(),
      manifests: this.registry.getAllManifests().map((manifest) => ({
        id: manifest.id,
        queries: manifest.queries.map((query) => query.id),
        actions: manifest.actions.map((action) => action.id),
      })),
    };
  }

  async runCommand(prompt: string, eventId?: string, connectorId?: string): Promise<Record<string, unknown>> {
    const event = this.findEvent(eventId);
    const connectors = await this.getConnectors();
    const connector = connectors.find((item) => item.id === (connectorId || event?.sourceId)) || connectors[0];
    const stats = await this.getStats();
    const workspace = await this.getWorkspace();
    const actions = event?.evaluation.recommendedActions || [];
    const citations = [
      event ? `${event.title}: ${event.summary}` : workspace.headline,
      connector ? `${connector.name}: ${connector.snapshot}` : "",
      ...((event?.evaluation.reasons || []).slice(0, 2)),
    ].filter(Boolean);

    return {
      prompt,
      posture: event?.evaluation.lane === "intervention" ? "Intervene now" : workspace.posture,
      summary: event
        ? `${event.title} is currently routed to ${event.evaluation.mode.toUpperCase()} at tier T${event.evaluation.tier}.`
        : workspace.headline,
      recommendation: event
        ? event.evaluation.recommendation
        : `No event is selected. Inspect ${connector?.name || "a live connector"} next because it is the best current source of truth.`,
      actions,
      citations,
      stats,
      source: "context-bus",
    };
  }

  getRegistry(): TabManifestRegistry {
    return this.registry;
  }

  getContextBus(): AgentContextBus {
    return this.contextBus;
  }

  publish(update: RuntimeUpdate): void {
    for (const listener of this.listeners) {
      listener(update);
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }
    if (this.initializing) {
      await this.initializing;
      return;
    }
    this.initializing = (async () => {
      this.seed();
      await mcpService.bootAutoStart();
      this.initialized = true;
      this.initializing = null;
    })();
    await this.initializing;
  }

  private seed(): void {
    this.ledger = getLedgerEntries(20);
    if (!this.ledger.length) {
      this.ledger = [
        {
          id: createId("log"),
          ts: nowIso(),
          sourceId: "builtin-gmail",
          mode: "shield",
          action: "blocked",
          summary: "Suspicious transfer blocked before money left the workspace.",
          saved: 3200,
        },
        {
          id: createId("log"),
          ts: nowIso(),
          sourceId: "builtin-slack",
          mode: "kiln",
          action: "softened",
          summary: "Escalating thread routed into calmer copy.",
          heat: 82,
        },
      ];
      for (const entry of this.ledger) {
        persistLedgerEntry(entry);
      }
    }
    if (!this.queue.length) {
      for (const connector of this.builtins.values()) {
        if (connector.connected) {
          this.queue.push(createBuiltinEvent(connector));
        }
      }
    }
  }

  private createMcpDemoEvent(sourceId: string, sourceName: string): FrictionEvent {
    const event: FrictionEvent = {
      id: createId("evt"),
      sourceId,
      sourceType: "mcp",
      title: "Custom MCP tool requested intervention",
      summary: "An MCP-connected workflow flagged an outbound action for review.",
      preview: "The tool recommends slowing down before the action is executed.",
      domain: "communications",
      actor: sourceName,
      surface: "external MCP workflow",
      urgency: 67,
      sentiment: 34,
      status: "queued",
      tags: ["mcp", "review"],
      receivedAt: nowIso(),
      evaluation: {} as FrictionEvent["evaluation"],
      trace: [createTraceEntry("captured", `Captured from ${sourceName}`, "External MCP server emitted a reviewable action.")],
    };
    event.evaluation = evaluateEvent(event);
    event.trace.push(createTraceEntry("classified", event.evaluation.headline, event.evaluation.recommendation));
    return event;
  }

  private registerProviders(): void {
    const providers: RuntimeProvider[] = [
      new RuntimeProvider(
        {
          id: "overview",
          name: "Overview",
          description: "Operator posture, top-line stats, and attention summary.",
          agentBrief: "Use this tab to understand the current operating posture of the workspace.",
          tags: ["workspace", "stats", "posture"],
          queries: [
            { id: "getSummary", description: "Get workspace summary", params: [], returnType: "summary", estimatedTokens: 120 },
            { id: "getAttention", description: "Get attention hotspots", params: [], returnType: "items", estimatedTokens: 180 },
          ],
          actions: [],
          contextContribution: { priority: 1, maxTokens: 240 },
        },
        this,
        async (queryId) => {
          if (queryId === "getSummary") {
            const workspace = await this.getWorkspace();
            return formatQuery({
              workspace,
              stats: await this.getStats(),
            }, `${workspace.headline} ${workspace.narrative}`);
          }
          return formatQuery(this.getQueue().slice(0, 4), this.getQueue().slice(0, 4).map((event) => `${event.title} / T${event.evaluation.tier}`).join("\n"));
        },
        async () => ({ success: false, message: "No actions on Overview." }),
        async () => {
          const workspace = await this.getWorkspace();
          const stats = await this.getStats();
          return {
            tabId: "overview",
            summary: `${workspace.headline} ${workspace.narrative}`,
            itemCount: stats.queueDepth,
            lastUpdated: Date.now(),
            highlights: [
              `${stats.hotQueue} hot items in queue`,
              `${stats.connectedConnectors} connectors connected`,
              `${stats.pluginsEnabled} plugins enabled`,
            ],
            tokenCount: 110,
          };
        }
      ),
      new RuntimeProvider(
        {
          id: "live-queue",
          name: "Live Queue",
          description: "Inbound events and intervention candidates.",
          agentBrief: "Use this tab to inspect queued events and their friction evaluations.",
          tags: ["queue", "events", "interventions"],
          queries: [
            { id: "getQueue", description: "Get queue items", params: [], returnType: "items", estimatedTokens: 220 },
            { id: "getEvent", description: "Get one event", params: [{ name: "eventId", type: "string", required: true, description: "The event to load" }], returnType: "snapshot", estimatedTokens: 120 },
          ],
          actions: [
            { id: "pushDemoEvent", description: "Push a demo event", params: [{ name: "sourceId", type: "string", required: false, description: "Optional connector source" }], risk: "low", requiresApproval: false },
          ],
          contextContribution: { priority: 2, maxTokens: 260 },
        },
        this,
        async (queryId, params) => {
          if (queryId === "getEvent") {
            return formatQuery(this.findEvent(String(params.eventId)) || null, JSON.stringify(this.findEvent(String(params.eventId)), null, 2));
          }
          const queue = this.getQueue();
          return formatQuery(queue, queue.map((event) => `${event.title}: ${event.evaluation.headline}`).join("\n"));
        },
        async (actionId, params) => {
          if (actionId === "pushDemoEvent") {
            const event = await this.simulateDemoEvent(params.sourceId ? String(params.sourceId) : undefined);
            return { success: true, message: "Demo event pushed.", data: event };
          }
          return { success: false, message: "Unknown action." };
        },
        async () => ({
          tabId: "live-queue",
          summary: `${this.getQueue().length} events are currently visible in the queue.`,
          itemCount: this.getQueue().length,
          lastUpdated: Date.now(),
          highlights: this.getQueue().slice(0, 3).map((event) => `${event.title} / ${event.evaluation.mode}`),
          tokenCount: 140,
        })
      ),
      new RuntimeProvider(
        {
          id: "connectors",
          name: "Connectors",
          description: "Built-in adapters plus MCP-managed sources.",
          agentBrief: "Use this tab to inspect live sources, MCP servers, and adapter health.",
          tags: ["connectors", "mcp", "adapters"],
          queries: [
            { id: "listConnectors", description: "List connectors", params: [], returnType: "items", estimatedTokens: 220 },
            { id: "getConnector", description: "Get one connector", params: [{ name: "connectorId", type: "string", required: true, description: "Connector ID" }], returnType: "snapshot", estimatedTokens: 120 },
          ],
          actions: [
            { id: "toggleBuiltinConnector", description: "Toggle a built-in connector", params: [{ name: "connectorId", type: "string", required: true, description: "Connector ID" }], risk: "low", requiresApproval: false },
          ],
          contextContribution: { priority: 3, maxTokens: 220 },
        },
        this,
        async (queryId, params) => {
          const connectors = await this.getConnectors();
          if (queryId === "getConnector") {
            const item = connectors.find((connector) => connector.id === String(params.connectorId)) || null;
            return formatQuery(item, JSON.stringify(item, null, 2));
          }
          return formatQuery(connectors, connectors.map((connector) => `${connector.name}: ${connector.snapshot}`).join("\n"));
        },
        async (actionId, params) => {
          if (actionId === "toggleBuiltinConnector") {
            const connector = await this.toggleBuiltinConnector(String(params.connectorId));
            return connector
              ? { success: true, message: `${connector.name} toggled.`, data: connector }
              : { success: false, message: "Connector not found." };
          }
          return { success: false, message: "Unknown action." };
        },
        async () => {
          const connectors = await this.getConnectors();
          return {
            tabId: "connectors",
            summary: `${connectors.filter((item) => item.connected).length} connectors are currently connected.`,
            itemCount: connectors.length,
            lastUpdated: Date.now(),
            highlights: connectors.slice(0, 3).map((connector) => `${connector.name} / ${connector.connected ? "connected" : "offline"}`),
            tokenCount: 150,
          };
        }
      ),
      new RuntimeProvider(
        {
          id: "plugins",
          name: "Plugins",
          description: "Built-in and MCP-derived tools available to the workspace.",
          agentBrief: "Use this tab to inspect plugin state and available tooling.",
          tags: ["plugins", "tools"],
          queries: [
            { id: "listPlugins", description: "List plugins", params: [], returnType: "items", estimatedTokens: 200 },
          ],
          actions: [],
          contextContribution: { priority: 4, maxTokens: 200 },
        },
        this,
        async () => {
          const plugins = await pluginRegistry.getPlugins();
          return formatQuery(plugins, plugins.map((plugin) => `${plugin.name}: ${plugin.description}`).join("\n"));
        },
        async () => ({ success: false, message: "No direct plugin actions on this tab." }),
        async () => {
          const plugins = await pluginRegistry.getPlugins();
          return {
            tabId: "plugins",
            summary: `${plugins.filter((plugin) => plugin.enabled).length} plugins are enabled across built-in and MCP sources.`,
            itemCount: plugins.length,
            lastUpdated: Date.now(),
            highlights: plugins.slice(0, 3).map((plugin) => `${plugin.name} / ${plugin.tools.length} tools`),
            tokenCount: 130,
          };
        }
      ),
      new RuntimeProvider(
        {
          id: "context-bus",
          name: "Context Bus",
          description: "Registry discovery, ambient context, and command routing.",
          agentBrief: "Use this tab to discover manifests and assemble context-aware answers.",
          tags: ["context", "manifests", "commands"],
          queries: [
            { id: "getAmbientContext", description: "Get ambient context", params: [], returnType: "items", estimatedTokens: 220 },
            { id: "getSelectionPacket", description: "Get selection packet", params: [{ name: "eventId", type: "string", required: false, description: "Selected event" }, { name: "connectorId", type: "string", required: false, description: "Selected connector" }], returnType: "snapshot", estimatedTokens: 120 },
            { id: "discoverTabs", description: "Discover manifests", params: [], returnType: "items", estimatedTokens: 180 },
          ],
          actions: [
            { id: "runCommand", description: "Run a command through the context bus", params: [{ name: "prompt", type: "string", required: true, description: "Command prompt" }, { name: "eventId", type: "string", required: false, description: "Selected event" }, { name: "connectorId", type: "string", required: false, description: "Selected connector" }], risk: "low", requiresApproval: false },
          ],
          contextContribution: { priority: 1, maxTokens: 260 },
        },
        this,
        async (queryId, params) => {
          if (queryId === "getSelectionPacket") {
            const packet = await this.getSelectionPacket(params.eventId ? String(params.eventId) : undefined, params.connectorId ? String(params.connectorId) : undefined);
            return formatQuery(packet, JSON.stringify(packet, null, 2));
          }
          if (queryId === "discoverTabs") {
            const manifests = this.registry.getAllManifests();
            return formatQuery(manifests, manifests.map((manifest) => `${manifest.id}: ${manifest.description}`).join("\n"));
          }
          const ambient = await this.contextBus.buildAmbientContext();
          return formatQuery(ambient, ambient.join("\n"));
        },
        async (actionId, params) => {
          if (actionId === "runCommand") {
            const result = await this.runCommand(
              String(params.prompt || ""),
              params.eventId ? String(params.eventId) : undefined,
              params.connectorId ? String(params.connectorId) : undefined
            );
            return { success: true, message: "Command executed.", data: result };
          }
          return { success: false, message: "Unknown action." };
        },
        async () => ({
          tabId: "context-bus",
          summary: "The context bus can discover manifests, build ambient context, and route commands.",
          itemCount: this.registry.getAllManifests().length,
          lastUpdated: Date.now(),
          highlights: this.registry.getAllManifests().slice(0, 3).map((manifest) => `${manifest.name} / ${manifest.queries.length} queries`),
          tokenCount: 130,
        })
      ),
      new RuntimeProvider(
        {
          id: "studio",
          name: "Studio",
          description: "Policy and playbook layer for the friction engines.",
          agentBrief: "Use this tab to inspect the stance, triggers, and playbooks for each friction engine.",
          tags: ["policies", "studio"],
          queries: [
            { id: "listPolicies", description: "List policies", params: [], returnType: "items", estimatedTokens: 160 },
          ],
          actions: [],
          contextContribution: { priority: 5, maxTokens: 180 },
        },
        this,
        async () => formatQuery(POLICIES, POLICIES.map((policy) => `${policy.title}: ${policy.trigger}`).join("\n")),
        async () => ({ success: false, message: "No direct actions on Studio." }),
        async () => ({
          tabId: "studio",
          summary: "Studio defines how Shield, Kiln, Quarry, and Lab introduce friction.",
          itemCount: POLICIES.length,
          lastUpdated: Date.now(),
          highlights: POLICIES.map((policy) => policy.title),
          tokenCount: 120,
        })
      ),
      new RuntimeProvider(
        {
          id: "ledger",
          name: "Ledger",
          description: "Outcome history for interventions and measurable changes.",
          agentBrief: "Use this tab to inspect evidence that friction changed outcomes.",
          tags: ["ledger", "history"],
          queries: [
            { id: "getLedger", description: "Get ledger entries", params: [], returnType: "items", estimatedTokens: 180 },
          ],
          actions: [],
          contextContribution: { priority: 6, maxTokens: 200 },
        },
        this,
        async () => formatQuery(this.ledger, this.ledger.map((entry) => `${entry.summary}`).join("\n")),
        async () => ({ success: false, message: "No direct actions on Ledger." }),
        async () => ({
          tabId: "ledger",
          summary: `${this.ledger.length} intervention outcomes are stored in the ledger.`,
          itemCount: this.ledger.length,
          lastUpdated: Date.now(),
          highlights: this.ledger.slice(0, 3).map((entry) => `${entry.mode} / ${entry.action}`),
          tokenCount: 120,
        })
      ),
    ];

    for (const provider of providers) {
      this.registry.register(provider);
    }
  }
}

function formatQuery(data: unknown, formatted: string): TabQueryResult {
  return {
    success: true,
    data,
    formatted,
    tokenCount: Math.max(20, Math.ceil(formatted.length / 4)),
    timestamp: Date.now(),
  };
}

export const runtimeService = RuntimeService.getInstance();
