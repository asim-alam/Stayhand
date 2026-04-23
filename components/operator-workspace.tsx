"use client";

import { startTransition, useEffect, useState } from "react";
import type {
  BootstrapPayload,
  ConnectorRecord,
  FrictionEvent,
  MCPServerStatus,
  Plugin,
  TabId,
} from "@/lib/types/runtime";

type CommandResult = {
  posture: string;
  summary: string;
  recommendation: string;
  actions?: Array<{ id: string; label: string; reason: string; primary?: boolean }>;
  citations?: string[];
};

type McpForm = {
  name: string;
  type: "stdio" | "http" | "sse";
  command: string;
  url: string;
  autoStart: boolean;
};

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "live-queue", label: "Live Queue" },
  { id: "connectors", label: "Connectors" },
  { id: "plugins", label: "Plugins" },
  { id: "context-bus", label: "Context Bus" },
  { id: "studio", label: "Studio" },
  { id: "ledger", label: "Ledger" },
];

const EMPTY_FORM: McpForm = {
  name: "",
  type: "stdio",
  command: "",
  url: "",
  autoStart: true,
};

export function OperatorWorkspace() {
  const [runtime, setRuntime] = useState<BootstrapPayload | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [selectedEventId, setSelectedEventId] = useState<string | undefined>(undefined);
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | undefined>(undefined);
  const [streamLive, setStreamLive] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [commandInput, setCommandInput] = useState("");
  const [commandResult, setCommandResult] = useState<CommandResult | null>(null);
  const [selectionPacket, setSelectionPacket] = useState<Record<string, unknown> | null>(null);
  const [mcpForm, setMcpForm] = useState<McpForm>(EMPTY_FORM);
  const [banner, setBanner] = useState<string>("");

  useEffect(() => {
    void refreshRuntime();
  }, []);

  useEffect(() => {
    const source = new EventSource("/api/runtime/stream");

    source.addEventListener("bootstrap", () => {
      setStreamLive(true);
      void refreshRuntime(selectedEventId, selectedConnectorId);
    });

    ["queue", "event", "plugins", "connectors", "mcp"].forEach((eventName) => {
      source.addEventListener(eventName, () => {
        setStreamLive(true);
        void refreshRuntime(selectedEventId, selectedConnectorId);
      });
    });

    source.onerror = () => {
      setStreamLive(false);
    };

    return () => {
      source.close();
    };
  }, [selectedConnectorId, selectedEventId]);

  async function refreshRuntime(nextEventId = selectedEventId, nextConnectorId = selectedConnectorId) {
    const search = new URLSearchParams();
    if (nextEventId) search.set("eventId", nextEventId);
    if (nextConnectorId) search.set("connectorId", nextConnectorId);
    const suffix = search.size ? `?${search.toString()}` : "";
    const response = await fetch(`/api/runtime/bootstrap${suffix}`, { cache: "no-store" });
    const payload = (await response.json()) as BootstrapPayload;
    startTransition(() => {
      setRuntime(payload);
      setSelectionPacket(payload.selectedPacket);
      if (!nextEventId && payload.queue[0]) {
        setSelectedEventId(payload.queue[0].id);
        setSelectedConnectorId(payload.queue[0].sourceId);
      }
      if (!nextConnectorId && payload.connectors[0]) {
        setSelectedConnectorId(payload.connectors[0].id);
      }
    });
  }

  async function postJson(url: string, body: unknown) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Request failed.");
    }
    return data;
  }

  async function handleDemoEvent(sourceId?: string) {
    await runBusy("Pushing demo event", async () => {
      const data = await postJson("/api/runtime/demo-event", { sourceId });
      setSelectedEventId(data.event.id);
      setSelectedConnectorId(data.event.sourceId);
      setActiveTab("live-queue");
      setBanner("Demo event pushed into the queue.");
      await refreshRuntime(data.event.id, data.event.sourceId);
    });
  }

  async function handleAnalyze() {
    if (!selectedEventId) return;
    await runBusy("Analyzing selection", async () => {
      await postJson("/api/interventions/evaluate", { eventId: selectedEventId });
      setBanner("Event re-evaluated.");
      await refreshRuntime(selectedEventId, selectedConnectorId);
    });
  }

  async function handleIntervention(action: string) {
    if (!selectedEventId) return;
    await runBusy(`Applying ${action}`, async () => {
      await postJson("/api/interventions/apply", { eventId: selectedEventId, action });
      setBanner(`Applied ${action} to the selected event.`);
      await refreshRuntime(selectedEventId, selectedConnectorId);
    });
  }

  async function handleToggleBuiltin(connectorId: string) {
    await runBusy("Toggling connector", async () => {
      await postJson("/api/context/action", {
        tabId: "connectors",
        actionId: "toggleBuiltinConnector",
        params: { connectorId },
      });
      setBanner("Built-in connector state updated.");
      await refreshRuntime(selectedEventId, connectorId);
    });
  }

  async function handlePluginToggle(plugin: Plugin) {
    await runBusy("Updating plugin", async () => {
      await postJson("/api/plugins/toggle", { id: plugin.id, enabled: !plugin.enabled });
      setBanner(`${plugin.name} ${plugin.enabled ? "disabled" : "enabled"}.`);
      await refreshRuntime(selectedEventId, selectedConnectorId);
    });
  }

  async function handleMcpToggle(server: MCPServerStatus) {
    await runBusy("Toggling MCP server", async () => {
      await postJson("/api/mcp/toggle", { name: server.name });
      setBanner(`MCP server ${server.name} updated.`);
      await refreshRuntime(selectedEventId, `mcp:${server.name}`);
    });
  }

  async function handleMcpRemove(server: MCPServerStatus) {
    await runBusy("Removing MCP server", async () => {
      const response = await fetch("/api/mcp/servers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: server.name }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to remove MCP server.");
      setBanner(`MCP server ${server.name} removed.`);
      await refreshRuntime(selectedEventId, selectedConnectorId);
    });
  }

  async function handleMcpAdd() {
    await runBusy("Adding MCP server", async () => {
      const payload =
        mcpForm.type === "stdio"
          ? { name: mcpForm.name, type: mcpForm.type, command: mcpForm.command, autoStart: mcpForm.autoStart }
          : { name: mcpForm.name, type: mcpForm.type, url: mcpForm.url, autoStart: mcpForm.autoStart };
      await postJson("/api/mcp/servers", payload);
      setMcpForm(EMPTY_FORM);
      setBanner(`MCP server ${mcpForm.name} added.`);
      await refreshRuntime(selectedEventId, selectedConnectorId);
    });
  }

  async function handleCommandRun(prompt = commandInput) {
    if (!prompt.trim()) return;
    await runBusy("Running command", async () => {
      const result = await postJson("/api/context/action", {
        tabId: "context-bus",
        actionId: "runCommand",
        params: {
          prompt,
          eventId: selectedEventId,
          connectorId: selectedConnectorId,
        },
      });
      setCommandResult(result.data as CommandResult);
      setBanner("Command deck updated.");
    });
  }

  async function handleContextRefresh() {
    await runBusy("Refreshing selection packet", async () => {
      const result = await postJson("/api/context/query", {
        tabId: "context-bus",
        queryId: "getSelectionPacket",
        params: {
          eventId: selectedEventId,
          connectorId: selectedConnectorId,
        },
      });
      setSelectionPacket(result.data as Record<string, unknown>);
    });
  }

  async function runBusy(label: string, action: () => Promise<void>) {
    try {
      setBusyLabel(label);
      await action();
    } catch (error) {
      setBanner(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setBusyLabel("");
    }
  }

  const selectedEvent = runtime?.queue.find((item) => item.id === selectedEventId) || null;
  const selectedConnector = runtime?.connectors.find((item) => item.id === selectedConnectorId) || null;

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">II</div>
          <div>
            <div className="brand-title">Stayhand</div>
            <div className="brand-subtitle">Operator Workspace</div>
          </div>
        </div>

        <div className="sidebar-group">
          <div className="sidebar-label">Surfaces</div>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`nav-button ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="sidebar-group">
          <div className="sidebar-label">Live posture</div>
          <MetricCard label="Connected connectors" value={String(runtime?.stats.connectedConnectors ?? 0)} />
          <MetricCard label="Hot queue" value={String(runtime?.stats.hotQueue ?? 0)} />
          <MetricCard label="Enabled plugins" value={String(runtime?.stats.pluginsEnabled ?? 0)} />
        </div>
      </aside>

      <section className="frame">
        <header className="hero">
          <div className="hero-status">
            <div className="eyebrow">Stayhand</div>
            <div className="selection-note">
              {selectedEvent
                ? `${selectedEvent.title} / ${selectedEvent.sourceId}`
                : selectedConnector
                  ? selectedConnector.name
                  : runtime?.workspace.posture || "Loading posture"}
            </div>
          </div>
          <div className="hero-actions">
            <span className={`status-pill ${streamLive ? "live" : ""}`}>{streamLive ? "stream live" : "stream offline"}</span>
            <button className="button ghost" onClick={() => void handleDemoEvent(selectedConnectorId)} disabled={Boolean(busyLabel)}>
              Simulate live event
            </button>
            <button className="button primary" onClick={() => void handleAnalyze()} disabled={!selectedEventId || Boolean(busyLabel)}>
              Analyze selection
            </button>
          </div>
        </header>

        <section className="command-card">
          <div className="command-top">
            <div>
              <div className="eyebrow">Command deck</div>
              <h2>Ask what deserves friction right now.</h2>
            </div>
            <div className="selection-note">
              {selectedEvent ? `${selectedEvent.title} / ${selectedEvent.sourceId}` : selectedConnector ? `${selectedConnector.name}` : "No selection yet"}
            </div>
          </div>
          <div className="command-row">
            <input
              value={commandInput}
              onChange={(event) => setCommandInput(event.target.value)}
              placeholder="e.g. Explain the safest next action for the selected event."
            />
            <button className="button primary" onClick={() => void handleCommandRun()} disabled={Boolean(busyLabel)}>
              Run
            </button>
          </div>
          <div className="preset-row">
            {(runtime?.commandPresets || []).map((preset) => (
              <button key={preset} className="chip" onClick={() => { setCommandInput(preset); void handleCommandRun(preset); }}>
                {preset}
              </button>
            ))}
          </div>
          <div className="command-output">
            {commandResult ? (
              <>
                <div className="command-summary">{commandResult.summary}</div>
                <div className="command-copy">{commandResult.recommendation}</div>
                <div className="action-list">
                  {(commandResult.actions || []).map((action) => (
                    <button key={action.id} className={`action-tile ${action.primary ? "primary" : ""}`} onClick={() => void handleIntervention(action.id)}>
                      <strong>{action.label}</strong>
                      <span>{action.reason}</span>
                    </button>
                  ))}
                </div>
                <div className="citation-row">
                  {(commandResult.citations || []).map((citation) => (
                    <span key={citation} className="citation">
                      {citation}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <div className="command-copy">Select an event or connector to generate a context-aware recommendation.</div>
            )}
          </div>
        </section>

        {banner ? <div className="banner">{busyLabel ? `${busyLabel}...` : banner}</div> : null}

        {activeTab === "overview" && runtime ? (
          <div className="grid two-up">
            <Card title="Workspace summary" kicker="Overview">
              <div className="stats-grid">
                <MetricCard label="Protected value" value={`$${runtime.stats.protectedValue.toLocaleString()}`} />
                <MetricCard label="Queue depth" value={String(runtime.stats.queueDepth)} />
                <MetricCard label="Running MCP servers" value={String(runtime.stats.runningMcpServers)} />
                <MetricCard label="Average quotient" value={`${runtime.stats.avgQuotient}/100`} />
              </div>
            </Card>
            <Card title="Top queue moments" kicker="Attention">
              <div className="stack">
                {runtime.queue.slice(0, 4).map((event) => (
                  <button
                    key={event.id}
                    className={`list-item ${selectedEventId === event.id ? "active" : ""}`}
                    onClick={() => {
                      setSelectedEventId(event.id);
                      setSelectedConnectorId(event.sourceId);
                      setActiveTab("live-queue");
                    }}
                  >
                    <div className="list-title">{event.title}</div>
                    <div className="list-meta">{event.evaluation.mode.toUpperCase()} / T{event.evaluation.tier} / {event.sourceId}</div>
                  </button>
                ))}
              </div>
            </Card>
          </div>
        ) : null}

        {activeTab === "live-queue" && runtime ? (
          <div className="grid queue-layout">
            <Card title="Queue" kicker="Live surface">
              <div className="stack">
                {runtime.queue.map((event) => (
                  <button
                    key={event.id}
                    className={`list-item ${selectedEventId === event.id ? "active" : ""}`}
                    onClick={() => {
                      setSelectedEventId(event.id);
                      setSelectedConnectorId(event.sourceId);
                      void refreshRuntime(event.id, event.sourceId);
                    }}
                  >
                    <div className="row spread">
                      <div className="list-title">{event.title}</div>
                      <span className={`tier tier-${event.evaluation.tier}`}>T{event.evaluation.tier}</span>
                    </div>
                    <div className="list-meta">{event.sourceId} / {event.surface} / {event.status}</div>
                  </button>
                ))}
              </div>
            </Card>

            <Card title={selectedEvent?.title || "Select an event"} kicker="Selected event">
              {selectedEvent ? (
                <>
                  <div className="detail-meta">{selectedEvent.actor} / {selectedEvent.surface}</div>
                  <p>{selectedEvent.summary}</p>
                  <div className="stats-grid">
                    <MetricCard label="Score" value={`${selectedEvent.evaluation.score}/100`} />
                    <MetricCard label="Lane" value={selectedEvent.evaluation.lane} />
                    <MetricCard label="Mode" value={selectedEvent.evaluation.mode} />
                    <MetricCard label="Status" value={selectedEvent.status} />
                  </div>
                  <div className="stack">
                    {selectedEvent.evaluation.reasons.map((reason) => (
                      <div key={reason} className="note">
                        {reason}
                      </div>
                    ))}
                  </div>
                  <div className="stack">
                    {selectedEvent.trace.map((trace) => (
                      <div key={trace.id} className={`trace trace-${trace.tone}`}>
                        <div className="row spread">
                          <strong>{trace.title}</strong>
                          <span>{new Date(trace.at).toLocaleTimeString()}</span>
                        </div>
                        <div>{trace.detail}</div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p>No event selected.</p>
              )}
            </Card>

            <Card title={selectedEvent?.evaluation.headline || "No action selected"} kicker="Intervention deck">
              {selectedEvent ? (
                <>
                  <p>{selectedEvent.evaluation.recommendation}</p>
                  <div className="action-list">
                    {selectedEvent.evaluation.recommendedActions.map((action) => (
                      <button key={action.id} className={`action-tile ${action.primary ? "primary" : ""}`} onClick={() => void handleIntervention(action.id)}>
                        <strong>{action.label}</strong>
                        <span>{action.reason}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p>Select an event from the queue.</p>
              )}
            </Card>
          </div>
        ) : null}

        {activeTab === "connectors" && runtime ? (
          <div className="grid two-up">
            <Card title="Connectors" kicker="Built-in and MCP">
              <div className="stack">
                {runtime.connectors.map((connector) => (
                  <div key={connector.id} className={`connector ${selectedConnectorId === connector.id ? "active" : ""}`}>
                    <div className="row spread">
                      <div>
                        <div className="list-title">{connector.name}</div>
                        <div className="list-meta">{connector.protocol} / {connector.transport} / {connector.owner}</div>
                      </div>
                      <span className={`status-dot ${connector.connected ? "online" : "offline"}`}>{connector.connected ? "connected" : "offline"}</span>
                    </div>
                    <p>{connector.snapshot}</p>
                    <div className="chip-row">
                      {connector.supports.slice(0, 4).map((item) => (
                        <span key={item} className="citation">
                          {item}
                        </span>
                      ))}
                    </div>
                    <div className="row">
                      <button className="button ghost" onClick={() => { setSelectedConnectorId(connector.id); void refreshRuntime(selectedEventId, connector.id); }}>
                        Inspect
                      </button>
                      {connector.sourceType === "builtin" ? (
                        <button className="button ghost" onClick={() => void handleToggleBuiltin(connector.id)}>
                          {connector.connected ? "Disable" : "Enable"}
                        </button>
                      ) : (
                        <>
                          <button className="button ghost" onClick={() => {
                            const server = runtime.mcpServers.find((item) => `mcp:${item.name}` === connector.id);
                            if (server) void handleMcpToggle(server);
                          }}>
                            {connector.connected ? "Stop" : "Start"}
                          </button>
                          <button className="button ghost danger" onClick={() => {
                            const server = runtime.mcpServers.find((item) => `mcp:${item.name}` === connector.id);
                            if (server) void handleMcpRemove(server);
                          }}>
                            Remove
                          </button>
                        </>
                      )}
                      <button className="button primary" onClick={() => void handleDemoEvent(connector.id)}>
                        Push sample event
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Add MCP server" kicker="Real MCP management">
              <div className="form-grid">
                <label>
                  <span>Name</span>
                  <input value={mcpForm.name} onChange={(event) => setMcpForm({ ...mcpForm, name: event.target.value })} placeholder="workspace-tools" />
                </label>
                <label>
                  <span>Type</span>
                  <select value={mcpForm.type} onChange={(event) => setMcpForm({ ...mcpForm, type: event.target.value as McpForm["type"] })}>
                    <option value="stdio">stdio</option>
                    <option value="http">http</option>
                    <option value="sse">sse</option>
                  </select>
                </label>
                {mcpForm.type === "stdio" ? (
                  <label className="full-width">
                    <span>Command</span>
                    <input value={mcpForm.command} onChange={(event) => setMcpForm({ ...mcpForm, command: event.target.value })} placeholder="npx -y @modelcontextprotocol/server-memory" />
                  </label>
                ) : (
                  <label className="full-width">
                    <span>URL</span>
                    <input value={mcpForm.url} onChange={(event) => setMcpForm({ ...mcpForm, url: event.target.value })} placeholder="http://localhost:8787/mcp" />
                  </label>
                )}
                <label className="checkbox-row full-width">
                  <input type="checkbox" checked={mcpForm.autoStart} onChange={(event) => setMcpForm({ ...mcpForm, autoStart: event.target.checked })} />
                  <span>Auto-start on boot</span>
                </label>
              </div>
              <div className="row">
                <button className="button primary" onClick={() => void handleMcpAdd()} disabled={!mcpForm.name || (mcpForm.type === "stdio" ? !mcpForm.command : !mcpForm.url)}>
                  Add MCP server
                </button>
              </div>
              <div className="stack">
                {runtime.mcpServers.map((server) => (
                  <div key={server.name} className="note">
                    <strong>{server.name}</strong>
                    <div>{server.running ? `${server.tools.length} tools live` : server.error || "Configured but stopped."}</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        ) : null}

        {activeTab === "plugins" && runtime ? (
          <Card title="Plugin registry" kicker="Built-in and MCP-derived tools">
            <div className="stack">
              {runtime.plugins.map((plugin) => (
                <div key={plugin.id} className="connector">
                  <div className="row spread">
                    <div>
                      <div className="list-title">{plugin.name}</div>
                      <div className="list-meta">{plugin.source} / {plugin.tools.length} tools</div>
                    </div>
                    <button className={`button ${plugin.enabled ? "ghost" : "primary"}`} onClick={() => void handlePluginToggle(plugin)}>
                      {plugin.enabled ? "Disable" : "Enable"}
                    </button>
                  </div>
                  <p>{plugin.description}</p>
                  <div className="chip-row">
                    {plugin.tools.slice(0, 6).map((tool) => (
                      <span key={tool.name} className="citation">
                        {tool.name}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        {activeTab === "context-bus" && runtime ? (
          <div className="grid two-up">
            <Card title="Ambient context" kicker="Context bus">
              <div className="stack">
                {runtime.ambientContext.map((item) => (
                  <div key={item} className="note">
                    {item}
                  </div>
                ))}
              </div>
            </Card>
            <Card title="Selection packet" kicker="Inspectable payload">
              <div className="row">
                <button className="button ghost" onClick={() => void handleContextRefresh()}>
                  Refresh packet
                </button>
              </div>
              <pre className="packet">{JSON.stringify(selectionPacket, null, 2)}</pre>
            </Card>
            <Card title="Registered manifests" kicker="Registry">
              <div className="stack">
                {runtime.manifests.map((manifest) => (
                  <div key={manifest.id} className="connector">
                    <div className="list-title">{manifest.name}</div>
                    <div className="list-meta">{manifest.description}</div>
                    <div className="chip-row">
                      {manifest.queries.map((query) => (
                        <span key={query.id} className="citation">
                          query:{query.id}
                        </span>
                      ))}
                      {manifest.actions.map((action) => (
                        <span key={action.id} className="citation">
                          action:{action.id}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        ) : null}

        {activeTab === "studio" && runtime ? (
          <Card title="Policy studio" kicker="Friction engines">
            <div className="stack">
              {runtime.policies.map((policy) => (
                <div key={policy.id} className="connector">
                  <div className="list-title">{policy.title}</div>
                  <div className="list-meta">{policy.mode.toUpperCase()}</div>
                  <p><strong>Trigger:</strong> {policy.trigger}</p>
                  <p><strong>Action:</strong> {policy.action}</p>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        {activeTab === "ledger" && runtime ? (
          <Card title="Outcome ledger" kicker="Intervention history">
            <div className="stack">
              {runtime.ledger.map((entry) => (
                <div key={entry.id} className="connector">
                  <div className="row spread">
                    <div>
                      <div className="list-title">{entry.summary}</div>
                      <div className="list-meta">{entry.mode.toUpperCase()} / {new Date(entry.ts).toLocaleString()}</div>
                    </div>
                    <div className="list-meta">
                      {typeof entry.saved === "number"
                        ? `$${entry.saved.toLocaleString()}`
                        : typeof entry.heat === "number"
                          ? `${entry.heat} heat`
                          : typeof entry.quotient === "number"
                            ? `${entry.quotient}/100`
                            : entry.action}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ) : null}
      </section>
    </main>
  );
}

function Card({ kicker, title, children }: { kicker: string; title: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="eyebrow">{kicker}</div>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
    </div>
  );
}
