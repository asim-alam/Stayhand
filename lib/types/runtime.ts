export type TabId =
  | "overview"
  | "live-queue"
  | "connectors"
  | "plugins"
  | "context-bus"
  | "studio"
  | "ledger";

export type FallbackReturnType = "items" | "summary" | "stats" | "snapshot" | "raw";
export type RiskLevel = "low" | "medium" | "high";
export type MCPServerType = "stdio" | "http" | "sse";
export type FrictionMode = "shield" | "kiln" | "quarry" | "lab";
export type FrictionLane = "green" | "advisory" | "intervention";
export type PluginSource = "built-in" | "mcp" | "user" | "system";
export type ConnectorSourceType = "builtin" | "mcp";
export type TraceTone = "neutral" | "warning" | "positive";

export interface QueryParam {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "string[]";
  required: boolean;
  description: string;
  default?: string | number | boolean | Record<string, unknown> | string[];
}

export interface TabQuery {
  id: string;
  description: string;
  params: QueryParam[];
  returnType: FallbackReturnType;
  estimatedTokens: number;
}

export interface TabAction {
  id: string;
  description: string;
  params: QueryParam[];
  risk: RiskLevel;
  requiresApproval: boolean;
}

export interface ContextContribution {
  priority: number;
  maxTokens: number;
}

export interface TabManifest {
  id: TabId;
  name: string;
  description: string;
  agentBrief: string;
  tags: string[];
  queries: TabQuery[];
  actions: TabAction[];
  contextContribution: ContextContribution;
}

export interface TabQueryResult {
  success: boolean;
  data: unknown;
  formatted: string;
  tokenCount: number;
  timestamp: number;
}

export interface TabActionResult {
  success: boolean;
  message: string;
  data?: unknown;
}

export interface TabSnapshot {
  tabId: TabId;
  summary: string;
  itemCount: number;
  lastUpdated: number;
  highlights: string[];
  tokenCount: number;
}

export interface MCPServerConfig {
  name: string;
  type?: MCPServerType;
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
  autoStart?: boolean;
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema?: {
    type: string;
    properties?: Record<
      string,
      {
        type: string;
        description?: string;
        enum?: string[];
        default?: unknown;
      }
    >;
    required?: string[];
  };
}

export interface MCPToolInfo {
  server: string;
  name: string;
  fullName: string;
  description: string;
  inputSchema?: MCPToolDefinition["inputSchema"];
}

export interface MCPServerStatus {
  name: string;
  running: boolean;
  tools: MCPToolInfo[];
  error: string | null;
  config: MCPServerConfig | null;
  process?: {
    pid: number | null;
  };
}

export interface PluginParameter {
  type: "string" | "number" | "boolean" | "object" | "array";
  description: string;
  required?: boolean;
  enum?: string[];
  items?: PluginParameter;
  properties?: Record<string, PluginParameter>;
}

export interface PluginTool {
  name: string;
  description: string;
  parameters: Record<string, PluginParameter>;
  requiresApproval?: boolean;
}

export interface Plugin {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  tools: PluginTool[];
  enabled: boolean;
  source: PluginSource;
}

export interface TraceEntry {
  id: string;
  title: string;
  detail: string;
  tone: TraceTone;
  type: "captured" | "classified" | "decision" | "resolved" | "connector";
  at: string;
}

export interface RecommendedAction {
  id: string;
  label: string;
  reason: string;
  primary?: boolean;
}

export interface InterventionDecision {
  mode: FrictionMode;
  tier: 0 | 1 | 2 | 3;
  lane: FrictionLane;
  reasons: string[];
  headline: string;
  recommendation: string;
  recommendedActions: RecommendedAction[];
  score: number;
}

export interface FrictionEvent {
  id: string;
  sourceId: string;
  sourceType: ConnectorSourceType;
  title: string;
  summary: string;
  preview: string;
  domain: "finance" | "communications" | "creative" | "habit";
  status: "queued" | "review" | "resolved";
  actor: string;
  surface: string;
  urgency: number;
  sentiment: number;
  amount?: number;
  tags: string[];
  receivedAt: string;
  evaluation: InterventionDecision;
  trace: TraceEntry[];
  outcomeHeadline?: string;
  resolution?: string;
  resolvedAt?: string;
}

export interface LedgerEntry {
  id: string;
  ts: string;
  sourceId: string;
  mode: FrictionMode;
  action: string;
  summary: string;
  saved?: number;
  heat?: number;
  quotient?: number;
}

export interface ConnectorHistoryEntry {
  id: string;
  at: string;
  title: string;
  detail: string;
}

export interface ConnectorRecord {
  id: string;
  sourceType: ConnectorSourceType;
  name: string;
  category: string;
  protocol: string;
  transport: string;
  trustMode: string;
  description: string;
  snapshot: string;
  supports: string[];
  connected: boolean;
  health: "live" | "warm" | "offline";
  owner: string;
  lastSync: string | null;
  latencyMs: number;
  reliability: number;
  volume: string;
  auth: string;
  queueDepth?: number;
  recentEvents?: FrictionEvent[];
  recentLedger?: LedgerEntry[];
  history?: ConnectorHistoryEntry[];
}

export interface WorkspaceStats {
  connectedConnectors: number;
  queueDepth: number;
  hotQueue: number;
  protectedValue: number;
  cooledMessages: number;
  avgQuotient: number;
  pluginsEnabled: number;
  runningMcpServers: number;
}

export interface WorkspacePayload {
  id: string;
  name: string;
  operator: string;
  posture: "Protected" | "Watchful" | "Under Load";
  headline: string;
  narrative: string;
}

export interface BootstrapPayload {
  workspace: WorkspacePayload;
  stats: WorkspaceStats;
  connectors: ConnectorRecord[];
  mcpServers: MCPServerStatus[];
  plugins: Plugin[];
  queue: FrictionEvent[];
  ledger: LedgerEntry[];
  policies: Array<{
    id: string;
    mode: FrictionMode;
    title: string;
    trigger: string;
    action: string;
  }>;
  manifests: TabManifest[];
  commandPresets: string[];
  ambientContext: string[];
  selectedPacket: Record<string, unknown> | null;
}
