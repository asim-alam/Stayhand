import {
  $,
  $all,
  createCountdownRing,
  escapeHtml,
  formatCurrency,
  formatRelativeTime,
  showToast,
} from "./ui.js";
import {
  applyIntervention,
  evaluateEvent,
  getBootstrap,
  openStream,
  queryContext,
  runCommand as runCommandRequest,
  simulateEvent,
  toggleConnector,
} from "./api.js";

const state = {
  app: null,
  workspace: null,
  stats: null,
  connectors: [],
  connectorDiagnostics: [],
  tabs: [],
  agents: [],
  ambientContext: [],
  attentionMap: [],
  queueSummary: null,
  playbooks: [],
  commandPresets: [],
  policies: [],
  events: [],
  ledger: [],
  selectionPacket: null,
  activeView: "overview",
  selectedEventId: null,
  selectedConnectorId: null,
  stream: null,
  commandResult: null,
  pending: {
    simulate: false,
    analyze: false,
    action: false,
    command: false,
    connector: "",
  },
  cooldown: {
    eventId: null,
    expiresAt: 0,
    stop: null,
  },
};

document.addEventListener("DOMContentLoaded", async () => {
  bindShell();
  await bootstrap();
});

async function bootstrap() {
  try {
    const payload = await getBootstrap();
    applyBootstrap(payload);
    renderAll();
    await refreshSelectionPacket();
    connectStream();
    renderCommandResult({
      summary: state.workspace?.headline || "Second Thought is ready.",
      recommendation: state.workspace?.narrative || "Select a surface or event to begin.",
      posture: state.workspace?.posture || "Protected",
      actions: [],
      citations: [],
      source: "deterministic",
    });
  } catch (error) {
    showToast(`Bootstrap failed: ${error.message}`, "error", 5000);
  }
}

function bindShell() {
  $all(".sidebar-tab").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeView = button.dataset.view;
      renderViewState();
      if (state.activeView === "context-bus") {
        refreshSelectionPacket();
      }
    });
  });

  $("#simulate-active").addEventListener("click", async () => {
    const connectorId = state.selectedConnectorId || getPreferredConnectorId();
    if (!connectorId || state.pending.simulate) {
      return;
    }
    state.pending.simulate = true;
    renderTopbarButtons();
    try {
      await simulateEvent(connectorId);
      showToast("Synthetic live event pushed into the queue.", "info");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      state.pending.simulate = false;
      renderTopbarButtons();
    }
  });

  $("#analyze-selection").addEventListener("click", () => analyzeSelection());
  $("#run-command").addEventListener("click", () => runCommand());
  $("#command-input").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      runCommand();
    }
  });
}

function connectStream() {
  if (state.stream) {
    state.stream.close();
  }

  state.stream = openStream({
    open: () => {
      $("#stream-status").textContent = "stream live";
      $("#stream-status").classList.add("live");
    },
    error: () => {
      $("#stream-status").textContent = "stream reconnecting";
      $("#stream-status").classList.remove("live");
    },
    bootstrap: (payload) => {
      applyBootstrap(payload);
      renderAll();
      refreshSelectionPacket();
    },
    event: ({ event, stats, ambient, queueSummary, connectorDiagnostics }) => {
      upsertEvent(event);
      state.stats = stats || state.stats;
      state.ambientContext = ambient || state.ambientContext;
      state.queueSummary = queueSummary || state.queueSummary;
      if (Array.isArray(connectorDiagnostics)) {
        state.connectorDiagnostics = connectorDiagnostics;
        state.connectors = connectorDiagnostics;
      }
      if (!state.selectedEventId) {
        setSelectedEvent(event.id, { preserveView: true });
      } else {
        renderAll();
      }
      showToast(`${event.connectorName}: ${event.title}`, "info");
      refreshSelectionPacket();
    },
    connector: ({ connector, stats, ambient, queueSummary, connectorDiagnostics }) => {
      upsertConnector(connector);
      state.stats = stats || state.stats;
      state.ambientContext = ambient || state.ambientContext;
      state.queueSummary = queueSummary || state.queueSummary;
      if (Array.isArray(connectorDiagnostics)) {
        state.connectorDiagnostics = connectorDiagnostics;
        state.connectors = connectorDiagnostics;
      }
      renderAll();
      refreshSelectionPacket();
    },
    evaluation: ({ event, evaluation, stats, queueSummary }) => {
      upsertEvent({ ...event, evaluation });
      state.stats = stats || state.stats;
      state.queueSummary = queueSummary || state.queueSummary;
      renderAll();
      refreshSelectionPacket();
    },
    ledger: ({ event, outcome, stats, ledger, queueSummary, connectorDiagnostics }) => {
      upsertEvent(event);
      state.stats = stats || state.stats;
      state.ledger = ledger || state.ledger;
      state.queueSummary = queueSummary || state.queueSummary;
      if (Array.isArray(connectorDiagnostics)) {
        state.connectorDiagnostics = connectorDiagnostics;
        state.connectors = connectorDiagnostics;
      }
      renderAll();
      renderCommandResult({
        summary: outcome.summary,
        recommendation: "The ledger has been updated and the connector snapshot has been refreshed.",
        posture: "Outcome logged",
        actions: [],
        citations: [event.title, outcome.summary],
        source: "system",
      });
      showToast(outcome.summary, "success", 4200);
      refreshSelectionPacket();
    },
  });
}

function applyBootstrap(payload) {
  state.app = payload.app || state.app;
  state.workspace = payload.workspace || state.workspace;
  state.stats = payload.stats || state.stats;
  state.connectors = payload.connectorDiagnostics || payload.connectors || state.connectors;
  state.connectorDiagnostics = payload.connectorDiagnostics || payload.connectors || state.connectorDiagnostics;
  state.tabs = payload.tabs || state.tabs;
  state.agents = payload.agents || state.agents;
  state.ambientContext = payload.ambientContext || state.ambientContext;
  state.attentionMap = payload.attentionMap || state.attentionMap;
  state.queueSummary = payload.queueSummary || state.queueSummary;
  state.playbooks = payload.playbooks || state.playbooks;
  state.commandPresets = payload.commandPresets || state.commandPresets;
  state.policies = payload.policies || state.policies;
  state.events = payload.events || state.events;
  state.ledger = payload.ledger || state.ledger;

  if (!state.selectedEventId) {
    state.selectedEventId = findFirstActionableEvent()?.id || state.events[0]?.id || null;
  }
  if (!state.selectedConnectorId) {
    state.selectedConnectorId = state.events.find((item) => item.id === state.selectedEventId)?.connectorId || getPreferredConnectorId();
  }
}

function renderAll() {
  if (!state.app || !state.stats) {
    return;
  }
  renderMetrics();
  renderAgents();
  renderTopbarButtons();
  renderViewState();
  renderCommandDeck();
  renderOverview();
  renderLiveSurface();
  renderConnectors();
  renderContextBus();
  renderStudio();
  renderLedger();
  updateCommandContext();
}

function renderViewState() {
  $all(".sidebar-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.activeView);
  });
  $all(".app-view").forEach((view) => {
    view.classList.toggle("active", view.id === `view-${state.activeView}`);
  });
}

function renderMetrics() {
  $("#metric-connected").textContent = String(state.stats.connectedConnectors);
  $("#metric-events").textContent = String(state.stats.hotQueue ?? state.stats.queuedEvents);
  $("#metric-quotient").textContent = `${state.stats.avgQuotient}/100`;
  $("#workspace-kicker").textContent = `${state.workspace?.posture || "Protected"} posture`;
  $("#workspace-title").textContent = state.workspace?.headline || state.app.tagline;
}

function renderTopbarButtons() {
  $("#simulate-active").disabled = state.pending.simulate;
  $("#analyze-selection").disabled = state.pending.analyze || !getSelectedEvent();
}

function renderAgents() {
  const map = new Map((state.attentionMap || []).map((item) => [item.mode, item]));
  $("#agent-list").innerHTML = state.agents
    .map((agent) => {
      const attention = map.get(agent.id);
      return `
        <div class="agent-chip">
          <div class="agent-chip-header">
            <span>${escapeHtml(agent.label)}</span>
            <span class="agent-chip-status">${escapeHtml(attention ? `${attention.count} live` : agent.status)}</span>
          </div>
          <div class="agent-chip-focus">${escapeHtml(agent.focus)}</div>
        </div>
      `;
    })
    .join("");
}

function renderCommandDeck() {
  $("#command-presets").innerHTML = (state.commandPresets || [])
    .map(
      (preset) => `
        <button class="preset-chip" data-command-preset="${escapeHtml(preset)}">${escapeHtml(preset)}</button>
      `
    )
    .join("");

  $all("[data-command-preset]", $("#command-presets")).forEach((button) => {
    button.addEventListener("click", () => {
      $("#command-input").value = button.dataset.commandPreset;
      runCommand();
    });
  });

  if (!state.commandResult) {
    $("#command-response").innerHTML = `
      <div class="command-card">
        <div class="command-card-header">
          <span class="command-badge">ready</span>
          <span class="command-source">system</span>
        </div>
        <div class="command-summary">Select an event or connector to generate a friction-aware recommendation.</div>
      </div>
    `;
    return;
  }

  const result = state.commandResult;
  $("#command-response").innerHTML = `
    <div class="command-card">
      <div class="command-card-header">
        <span class="command-badge">${escapeHtml(result.posture || "advisory")}</span>
        <span class="command-source">${escapeHtml(result.source || "deterministic")}</span>
      </div>
      <div class="command-summary">${escapeHtml(result.summary || "")}</div>
      <div class="command-copy">${escapeHtml(result.recommendation || "")}</div>
      ${
        Array.isArray(result.actions) && result.actions.length
          ? `
            <div class="command-action-list">
              ${result.actions
                .map(
                  (action) => `
                    <button class="command-action ${action.primary ? "primary" : ""}" data-command-action="${action.id}">
                      <span>${escapeHtml(action.label)}</span>
                      <span>${escapeHtml(action.reason || "")}</span>
                    </button>
                  `
                )
                .join("")}
            </div>
          `
          : ""
      }
      ${
        Array.isArray(result.citations) && result.citations.length
          ? `
            <div class="command-citations">
              ${result.citations.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
            </div>
          `
          : ""
      }
    </div>
  `;

  $all("[data-command-action]", $("#command-response")).forEach((button) => {
    button.addEventListener("click", async () => {
      const event = getSelectedEvent();
      if (!event) {
        state.activeView = "live-surface";
        renderViewState();
        return;
      }
      await handleIntervention(button.dataset.commandAction);
    });
  });
}

function renderOverview() {
  const topEvents = sortEventsForAttention(state.events).slice(0, 4);
  const recentLedger = state.ledger.slice(0, 4);
  const attention = state.attentionMap || [];

  $("#view-overview").innerHTML = `
    <div class="view-grid overview-grid">
      <section class="panel glass-elevated hero-panel">
        <div class="panel-kicker">Workspace thesis</div>
        <h2 class="panel-title">Friction is operating as a shared system capability.</h2>
        <p class="panel-copy">${escapeHtml(state.workspace?.narrative || state.app.thesis)}</p>
        <div class="insight-strip">
          ${renderInsightCard("Protected value", formatCurrency(state.stats.protectedValue))}
          ${renderInsightCard("Resolved interventions", String(state.stats.resolvedToday))}
          ${renderInsightCard("Critical queue", String(state.queueSummary?.critical || 0))}
          ${renderInsightCard("Live signals", String(state.stats.liveSignals || 0))}
        </div>
      </section>

      <section class="panel glass-elevated">
        <div class="panel-kicker">Attention map</div>
        <h3 class="panel-title">Which friction modes are carrying load.</h3>
        <div class="attention-list">
          ${attention
            .map(
              (item) => `
                <div class="attention-row">
                  <div class="attention-meta">
                    <span>${escapeHtml(item.label)}</span>
                    <span>${item.count} live / ${item.peak} peak</span>
                  </div>
                  <div class="attention-bar"><span style="width:${Math.max(6, item.peak)}%"></span></div>
                </div>
              `
            )
            .join("")}
        </div>
      </section>

      <section class="panel glass-elevated">
        <div class="panel-kicker">Live queue</div>
        <h3 class="panel-title">The moments currently asking for judgment.</h3>
        <div class="mini-feed">
          ${topEvents
            .map(
              (event) => `
                <button class="mini-feed-item" data-select-event="${event.id}">
                  <div class="mini-feed-title">${escapeHtml(event.title)}</div>
                  <div class="mini-feed-meta">${escapeHtml(event.connectorName)} / ${escapeHtml(event.evaluation.mode)} / T${event.evaluation.tier}</div>
                </button>
              `
            )
            .join("")}
        </div>
      </section>

      <section class="panel glass-elevated">
        <div class="panel-kicker">Recent proof</div>
        <h3 class="panel-title">The ledger is showing actual outcomes, not promises.</h3>
        <div class="ledger-preview">
          ${recentLedger.map(renderLedgerRow).join("")}
        </div>
      </section>
    </div>
  `;

  bindEventSelection($("#view-overview"));
}

function renderLiveSurface() {
  const selected = getSelectedEvent();
  const evaluation = selected?.evaluation;
  const actions = selected?.suggestedActions || [];

  $("#view-live-surface").innerHTML = `
    <div class="view-grid live-grid premium-live-grid">
      <section class="panel glass-elevated">
        <div class="panel-kicker">Live queue</div>
        <h3 class="panel-title">Operator review surface</h3>
        <div class="queue-list">
          ${sortEventsForAttention(state.events)
            .map(
              (event) => `
                <button class="queue-item ${event.id === state.selectedEventId ? "active" : ""}" data-select-event="${event.id}">
                  <div class="queue-item-top">
                    <div class="queue-title">${escapeHtml(event.title)}</div>
                    <div class="severity-chip tier-${event.evaluation.tier}">T${event.evaluation.tier}</div>
                  </div>
                  <div class="queue-meta">${escapeHtml(event.connectorName)} / ${escapeHtml(event.surface || event.domain)} / ${escapeHtml(event.status)}</div>
                  <div class="queue-tags">${(event.tags || []).map((tag) => `<span class="queue-tag">${escapeHtml(tag)}</span>`).join("")}</div>
                </button>
              `
            )
            .join("")}
        </div>
      </section>

      <section class="panel glass-elevated">
        ${
          selected
            ? `
              <div class="panel-kicker">Selected event</div>
              <div class="detail-headline">
                <div>
                  <h3 class="panel-title">${escapeHtml(selected.title)}</h3>
                  <div class="detail-meta">${escapeHtml(selected.connectorName)} / ${escapeHtml(selected.actor || "Unknown actor")} / ${formatRelativeTime(selected.receivedAt)}</div>
                </div>
                <div class="lane-pill ${escapeHtml(evaluation.lane)}">${escapeHtml(evaluation.lane)}</div>
              </div>
              <p class="panel-copy">${escapeHtml(selected.summary)}</p>
              <div class="preview-box">${escapeHtml(selected.preview || selected.summary)}</div>
              <div class="detail-stats">
                <div class="detail-stat"><span class="detail-stat-label">score</span><span class="detail-stat-value">${evaluation.score}/100</span></div>
                <div class="detail-stat"><span class="detail-stat-label">mode</span><span class="detail-stat-value">${escapeHtml(evaluation.mode)}</span></div>
                <div class="detail-stat"><span class="detail-stat-label">confidence</span><span class="detail-stat-value">${escapeHtml(evaluation.confidence)}</span></div>
                <div class="detail-stat"><span class="detail-stat-label">status</span><span class="detail-stat-value">${escapeHtml(selected.status)}</span></div>
              </div>
              <div class="reason-list">
                ${evaluation.reasons.map((reason) => `<div class="reason-item">${escapeHtml(reason)}</div>`).join("")}
              </div>
              <div class="trace-list">
                ${(selected.trace || [])
                  .map(
                    (item) => `
                      <div class="trace-item trace-${escapeHtml(item.tone || "neutral")}">
                        <div class="trace-top">
                          <span>${escapeHtml(item.title)}</span>
                          <span>${formatRelativeTime(item.at)}</span>
                        </div>
                        <div class="trace-copy">${escapeHtml(item.detail)}</div>
                      </div>
                    `
                  )
                  .join("")}
              </div>
            `
            : '<div class="panel-copy">No live event selected.</div>'
        }
      </section>

      <section class="panel glass-elevated">
        ${
          evaluation
            ? `
              <div class="panel-kicker">Intervention deck</div>
              <h3 class="panel-title">${escapeHtml(evaluation.recommendation.title)}</h3>
              <div class="intervention-score">
                <div class="score-display">${evaluation.score}</div>
                <div class="score-copy">${escapeHtml(evaluation.headline)}</div>
              </div>
              ${
                evaluation.tier >= 3 && selected.status !== "resolved"
                  ? `
                    <div class="cooldown-card">
                      <div class="cooldown-copy">High-severity moments earn a visible hold window before release.</div>
                      <div id="cooldown-ring"></div>
                    </div>
                  `
                  : ""
              }
              <div class="action-stack">
                ${actions
                  .map(
                    (action) => `
                      <button class="btn ${action.primary ? "btn-primary" : "btn-ghost"} intervention-action" data-apply-action="${action.id}">
                        ${escapeHtml(action.label)}
                      </button>
                    `
                  )
                  .join("")}
              </div>
              <div class="micro-note">Primary action: ${escapeHtml(evaluation.recommendation.actionLabel)}</div>
            `
            : '<div class="panel-copy">Run analysis on a selected event to see the friction playbook.</div>'
        }
      </section>
    </div>
  `;

  bindEventSelection($("#view-live-surface"));
  $all("[data-apply-action]", $("#view-live-surface")).forEach((button) => {
    button.addEventListener("click", async () => {
      await handleIntervention(button.dataset.applyAction);
    });
  });
  mountCooldownRing(selected);
}

function renderConnectors() {
  const selected = getSelectedConnector();
  const diagnostics = sortConnectors(state.connectorDiagnostics);

  $("#view-connectors").innerHTML = `
    <div class="view-grid connectors-grid premium-connectors-grid">
      <section class="panel glass-elevated">
        <div class="panel-kicker">Connector registry</div>
        <h3 class="panel-title">Live and standby surfaces</h3>
        <div class="connector-card-list">
          ${diagnostics
            .map(
              (connector) => `
                <button class="connector-list-item ${connector.id === state.selectedConnectorId ? "active" : ""}" data-select-connector="${connector.id}">
                  <div class="connector-list-top">
                    <div>
                      <div class="connector-list-title">${escapeHtml(connector.name)}</div>
                      <div class="connector-meta">${escapeHtml(connector.protocol)} / ${escapeHtml(connector.transport)} / ${escapeHtml(connector.owner || "workspace")}</div>
                    </div>
                    <div class="connector-health ${connector.connected ? "live" : "offline"}">${connector.connected ? "connected" : "offline"}</div>
                  </div>
                  <div class="connector-stats-inline">
                    <span>${connector.queueDepth || 0} queue</span>
                    <span>${connector.latencyMs || 0}ms</span>
                    <span>${connector.uptimeLabel || ""}</span>
                  </div>
                </button>
              `
            )
            .join("")}
        </div>
      </section>

      <section class="panel glass-elevated">
        ${
          selected
            ? `
              <div class="panel-kicker">Selected connector</div>
              <div class="connector-card-header">
                <div>
                  <h3 class="panel-title">${escapeHtml(selected.name)}</h3>
                  <div class="connector-meta">${escapeHtml(selected.category)} / ${escapeHtml(selected.auth || "custom auth")} / ${escapeHtml(selected.trustMode)}</div>
                </div>
                <div class="connector-health ${selected.connected ? "live" : "offline"}">${selected.connected ? "connected" : "offline"}</div>
              </div>
              <p class="panel-copy">${escapeHtml(selected.snapshot)}</p>
              <div class="detail-stats">
                <div class="detail-stat"><span class="detail-stat-label">queue depth</span><span class="detail-stat-value">${selected.queueDepth || 0}</span></div>
                <div class="detail-stat"><span class="detail-stat-label">latency</span><span class="detail-stat-value">${selected.latencyMs || 0}ms</span></div>
                <div class="detail-stat"><span class="detail-stat-label">reliability</span><span class="detail-stat-value">${selected.reliability || 0}%</span></div>
                <div class="detail-stat"><span class="detail-stat-label">volume</span><span class="detail-stat-value">${escapeHtml(selected.volume || "n/a")}</span></div>
              </div>
              <div class="connector-pill-list">
                ${(selected.supports || []).map((item) => `<span class="connector-pill">${escapeHtml(item)}</span>`).join("")}
              </div>
              <div class="connector-code">${escapeHtml(selected.mcpCommand || "")}</div>
              <div class="action-stack">
                <button class="btn ${selected.connected ? "btn-danger" : "btn-primary"}" data-toggle-connector="${selected.id}">
                  ${selected.connected ? "Disconnect" : "Connect"}
                </button>
                <button class="btn btn-ghost" data-simulate-connector="${selected.id}">Push sample event</button>
                <button class="btn btn-ghost" data-command-about="${selected.id}">Ask command deck</button>
              </div>
              <div class="connector-history-list">
                ${(selected.history || [])
                  .map(
                    (item) => `
                      <div class="history-item">
                        <div class="trace-top">
                          <span>${escapeHtml(item.title)}</span>
                          <span>${formatRelativeTime(item.at)}</span>
                        </div>
                        <div class="trace-copy">${escapeHtml(item.detail)}</div>
                      </div>
                    `
                  )
                  .join("")}
              </div>
            `
            : '<div class="panel-copy">Select a connector to inspect its diagnostics.</div>'
        }
      </section>
    </div>
  `;

  $all("[data-select-connector]", $("#view-connectors")).forEach((button) => {
    button.addEventListener("click", () => setSelectedConnector(button.dataset.selectConnector));
  });
  $all("[data-toggle-connector]", $("#view-connectors")).forEach((button) => {
    button.addEventListener("click", async () => {
      await handleToggleConnector(button.dataset.toggleConnector);
    });
  });
  $all("[data-simulate-connector]", $("#view-connectors")).forEach((button) => {
    button.addEventListener("click", async () => {
      await handleSimulate(button.dataset.simulateConnector);
    });
  });
  $all("[data-command-about]", $("#view-connectors")).forEach((button) => {
    button.addEventListener("click", async () => {
      $("#command-input").value = "Which connected surface is drifting out of trust?";
      await runCommand(button.dataset.commandAbout);
    });
  });
}

function renderContextBus() {
  const packet = state.selectionPacket;
  $("#view-context-bus").innerHTML = `
    <div class="view-grid context-grid premium-context-grid">
      <section class="panel glass-elevated">
        <div class="panel-kicker">Ambient context</div>
        <h3 class="panel-title">What every agent sees by default.</h3>
        <div class="ambient-list">
          ${state.ambientContext
            .map(
              (item) => `
                <div class="ambient-item">
                  <div class="ambient-label">${escapeHtml(item.label)}</div>
                  <div class="ambient-copy">${escapeHtml(item.snapshot)}</div>
                  <div class="ambient-subline">${escapeHtml(item.protocol)} / ${escapeHtml(item.transport)} / ${escapeHtml(item.trustMode)}</div>
                </div>
              `
            )
            .join("")}
        </div>
      </section>

      <section class="panel glass-elevated">
        <div class="panel-kicker">Manifest registry</div>
        <h3 class="panel-title">Tabs self-describe like a tool-aware workspace.</h3>
        <div class="manifest-table">
          ${state.tabs
            .map(
              (tab) => `
                <div class="manifest-row">
                  <div>
                    <div class="manifest-name">${escapeHtml(tab.name)}</div>
                    <div class="manifest-desc">${escapeHtml(tab.description)}</div>
                  </div>
                  <div class="manifest-queries">${(tab.queries || []).map((query) => `<span>${escapeHtml(query)}</span>`).join("")}</div>
                </div>
              `
            )
            .join("")}
        </div>
      </section>

      <section class="panel glass-elevated">
        <div class="panel-kicker">Selection packet</div>
        <h3 class="panel-title">The exact context bundle for the current focus.</h3>
        <div class="action-inline">
          <button class="btn btn-ghost" id="refresh-packet">Refresh packet</button>
          <button class="btn btn-ghost" id="inspect-live-queue">Get live queue</button>
        </div>
        <pre class="packet-view">${escapeHtml(JSON.stringify(packet, null, 2))}</pre>
      </section>
    </div>
  `;

  $("#refresh-packet")?.addEventListener("click", () => refreshSelectionPacket());
  $("#inspect-live-queue")?.addEventListener("click", async () => {
    try {
      const result = await queryContext("live-surface", "getLiveQueue");
      state.selectionPacket = {
        ...(state.selectionPacket || {}),
        liveQueueSample: result.items?.slice(0, 3) || [],
      };
      renderContextBus();
    } catch (error) {
      showToast(error.message, "error");
    }
  });
}

function renderStudio() {
  const livePolicies = (state.policies || []).map((policy) => ({
    ...policy,
    queueHits: state.events.filter((event) => event.evaluation?.mode === policy.mode && event.status !== "resolved").length,
  }));

  $("#view-studio").innerHTML = `
    <div class="view-grid studio-grid premium-studio-grid">
      <section class="panel glass-elevated">
        <div class="panel-kicker">Friction policies</div>
        <h3 class="panel-title">Operator rules that deliberately slow the wrong moments.</h3>
        <div class="policy-list">
          ${livePolicies
            .map(
              (policy) => `
                <div class="policy-card">
                  <div class="policy-card-top">
                    <div class="policy-mode">${escapeHtml(policy.mode)}</div>
                    <div class="policy-hit-count">${policy.queueHits} live hits</div>
                  </div>
                  <div class="policy-title">${escapeHtml(policy.title)}</div>
                  <div class="policy-copy"><strong>Trigger:</strong> ${escapeHtml(policy.trigger)}</div>
                  <div class="policy-copy"><strong>Action:</strong> ${escapeHtml(policy.action)}</div>
                </div>
              `
            )
            .join("")}
        </div>
      </section>

      <section class="panel glass-elevated">
        <div class="panel-kicker">Playbooks</div>
        <h3 class="panel-title">Each mode behaves like a live operator workflow.</h3>
        <div class="playbook-list">
          ${(state.playbooks || [])
            .map(
              (playbook) => `
                <div class="playbook-item">
                  <div class="playbook-title">${escapeHtml(playbook.title)}</div>
                  <div class="playbook-copy">${escapeHtml(playbook.focus)}</div>
                  <div class="micro-note">${escapeHtml(playbook.cadence)}</div>
                  <div class="micro-note">Metric: ${escapeHtml(playbook.successMetric)}</div>
                </div>
              `
            )
            .join("")}
        </div>
      </section>
    </div>
  `;
}

function renderLedger() {
  $("#view-ledger").innerHTML = `
    <div class="view-grid ledger-grid premium-ledger-grid">
      <section class="panel glass-elevated">
        <div class="panel-kicker">Outcome ledger</div>
        <h3 class="panel-title">Every slowdown is tied to a measurable result.</h3>
        <div class="insight-strip">
          ${renderInsightCard("Protected", formatCurrency(state.stats.protectedValue))}
          ${renderInsightCard("Cooled", String(state.stats.cooledMessages))}
          ${renderInsightCard("Quotient", `${state.stats.avgQuotient}/100`)}
          ${renderInsightCard("Last archetype", escapeHtml(state.stats.lastArchetype))}
        </div>
        <div class="ledger-preview">
          ${state.ledger.map(renderLedgerRow).join("")}
        </div>
      </section>
    </div>
  `;
}

function updateCommandContext() {
  const event = getSelectedEvent();
  const connector = getSelectedConnector();
  if (event) {
    $("#command-context").textContent = `${event.connectorName} / ${event.title}`;
    return;
  }
  if (connector) {
    $("#command-context").textContent = `${connector.name} / ${connector.trustMode}`;
    return;
  }
  $("#command-context").textContent = "No selection yet.";
}

async function analyzeSelection() {
  const event = getSelectedEvent();
  if (!event || state.pending.analyze) {
    return;
  }
  state.pending.analyze = true;
  renderTopbarButtons();
  try {
    const result = await evaluateEvent(event.id);
    upsertEvent(result.event);
    state.stats = result.stats || state.stats;
    state.queueSummary = result.queueSummary || state.queueSummary;
    renderAll();
    renderCommandResult({
      summary: result.evaluation.headline,
      recommendation: result.evaluation.recommendation.explanation,
      posture: result.evaluation.posture,
      actions: result.event.suggestedActions || [],
      citations: result.evaluation.reasons || [],
      source: "analysis",
    });
    await refreshSelectionPacket();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    state.pending.analyze = false;
    renderTopbarButtons();
  }
}

async function runCommand(connectorIdOverride = null) {
  const prompt = $("#command-input").value.trim();
  if (!prompt || state.pending.command) {
    if (!prompt) {
      showToast("Type a command first.", "warning");
    }
    return;
  }
  state.pending.command = true;
  try {
    const result = await runCommandRequest(prompt, state.selectedEventId, connectorIdOverride || state.selectedConnectorId);
    renderCommandResult(result);
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    state.pending.command = false;
  }
}

function renderCommandResult(result) {
  state.commandResult = result;
  renderCommandDeck();
}

async function handleIntervention(action) {
  const event = getSelectedEvent();
  if (!event || state.pending.action) {
    return;
  }
  state.pending.action = true;
  try {
    const result = await applyIntervention(event.id, action);
    upsertEvent(result.event);
    state.stats = result.stats || state.stats;
    state.ledger = result.ledger || state.ledger;
    state.queueSummary = result.queueSummary || state.queueSummary;
    if (Array.isArray(result.connectorDiagnostics)) {
      state.connectorDiagnostics = result.connectorDiagnostics;
      state.connectors = result.connectorDiagnostics;
    }
    renderAll();
    await refreshSelectionPacket();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    state.pending.action = false;
  }
}

async function handleToggleConnector(connectorId) {
  if (state.pending.connector === connectorId) {
    return;
  }
  state.pending.connector = connectorId;
  try {
    const result = await toggleConnector(connectorId);
    upsertConnector(result.connector);
    state.stats = result.stats || state.stats;
    state.ambientContext = result.ambient || state.ambientContext;
    state.queueSummary = result.queueSummary || state.queueSummary;
    if (Array.isArray(result.connectorDiagnostics)) {
      state.connectorDiagnostics = result.connectorDiagnostics;
      state.connectors = result.connectorDiagnostics;
    }
    renderAll();
    await refreshSelectionPacket();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    state.pending.connector = "";
  }
}

async function handleSimulate(connectorId) {
  if (!connectorId) {
    showToast("Select or connect a connector first.", "warning");
    return;
  }
  state.selectedConnectorId = connectorId;
  await simulateEvent(connectorId);
  showToast("Connector generated a synthetic live event.", "info");
}

async function refreshSelectionPacket() {
  try {
    const response = await queryContext("context-bus", "getSelectionPacket", {
      eventId: state.selectedEventId,
      connectorId: state.selectedConnectorId,
    });
    state.selectionPacket = response.item || null;
    if (state.activeView === "context-bus") {
      renderContextBus();
    }
  } catch {
    // Keep local UI usable if the packet refresh fails.
  }
}

function setSelectedEvent(eventId, { preserveView = false } = {}) {
  const event = state.events.find((item) => item.id === eventId);
  if (!event) {
    return;
  }
  state.selectedEventId = eventId;
  state.selectedConnectorId = event.connectorId || state.selectedConnectorId;
  if (!preserveView) {
    state.activeView = "live-surface";
  }
  renderAll();
  refreshSelectionPacket();
}

function setSelectedConnector(connectorId) {
  state.selectedConnectorId = connectorId;
  if (state.activeView !== "connectors") {
    state.activeView = "connectors";
  }
  renderAll();
  refreshSelectionPacket();
}

function getSelectedEvent() {
  return state.events.find((event) => event.id === state.selectedEventId) || null;
}

function getSelectedConnector() {
  return state.connectorDiagnostics.find((connector) => connector.id === state.selectedConnectorId) || null;
}

function getPreferredConnectorId() {
  return state.connectorDiagnostics.find((item) => item.connected)?.id || state.connectorDiagnostics[0]?.id || null;
}

function findFirstActionableEvent() {
  return sortEventsForAttention(state.events).find((event) => event.status !== "resolved") || null;
}

function bindEventSelection(root) {
  $all("[data-select-event]", root).forEach((button) => {
    button.addEventListener("click", () => setSelectedEvent(button.dataset.selectEvent));
  });
}

function mountCooldownRing(event) {
  const host = $("#cooldown-ring", $("#view-live-surface"));
  if (!host || !event || event.status === "resolved" || Number(event.evaluation?.tier || 0) < 3) {
    clearCooldown();
    return;
  }

  if (state.cooldown.stop) {
    state.cooldown.stop();
  }

  const nextExpiry =
    state.cooldown.eventId === event.id && state.cooldown.expiresAt > Date.now()
      ? state.cooldown.expiresAt
      : Date.now() + 10000;

  state.cooldown.eventId = event.id;
  state.cooldown.expiresAt = nextExpiry;
  state.cooldown.stop = createCountdownRing(
    host,
    Math.max(1, Math.ceil((nextExpiry - Date.now()) / 1000)),
    "#e76f51",
    null,
    () => {
      if (state.selectedEventId === event.id && event.status !== "resolved") {
        renderCommandResult({
          summary: "Cooling window completed.",
          recommendation: "Reassess the message before you release it. The timer is a review aid, not an auto-send.",
          posture: "Hold review",
          actions: event.suggestedActions || [],
          citations: event.evaluation?.reasons || [],
          source: "timer",
        });
        showToast("Cooling window completed. Review before release.", "info");
      }
    }
  );
}

function clearCooldown() {
  if (state.cooldown.stop) {
    state.cooldown.stop();
  }
  state.cooldown = {
    eventId: null,
    expiresAt: 0,
    stop: null,
  };
}

function upsertEvent(next) {
  const index = state.events.findIndex((event) => event.id === next.id);
  if (index === -1) {
    state.events.unshift(next);
  } else {
    state.events[index] = next;
  }
  state.events = sortEventsForAttention(state.events).slice(0, 50);
  if (!state.selectedEventId) {
    state.selectedEventId = state.events[0]?.id || null;
  }
}

function upsertConnector(next) {
  const index = state.connectorDiagnostics.findIndex((connector) => connector.id === next.id);
  if (index === -1) {
    state.connectorDiagnostics.push(next);
  } else {
    state.connectorDiagnostics[index] = {
      ...state.connectorDiagnostics[index],
      ...next,
    };
  }
  state.connectors = state.connectorDiagnostics;
}

function sortEventsForAttention(events) {
  return [...events].sort((left, right) => {
    const leftResolved = left.status === "resolved" ? 1 : 0;
    const rightResolved = right.status === "resolved" ? 1 : 0;
    if (leftResolved !== rightResolved) {
      return leftResolved - rightResolved;
    }
    const leftTier = Number(left.evaluation?.tier || 0);
    const rightTier = Number(right.evaluation?.tier || 0);
    if (leftTier !== rightTier) {
      return rightTier - leftTier;
    }
    return new Date(right.receivedAt).getTime() - new Date(left.receivedAt).getTime();
  });
}

function sortConnectors(connectors) {
  return [...connectors].sort((left, right) => {
    if (left.connected !== right.connected) {
      return left.connected ? -1 : 1;
    }
    return (right.queueDepth || 0) - (left.queueDepth || 0);
  });
}

function renderInsightCard(label, value) {
  return `
    <div class="insight-card">
      <span class="insight-value">${value}</span>
      <span class="insight-label">${label}</span>
    </div>
  `;
}

function renderLedgerRow(entry) {
  const side = entry.saved
    ? formatCurrency(entry.saved)
    : entry.heat
      ? `${entry.heat} heat`
      : entry.quotient
        ? `${entry.quotient}/100`
        : entry.action;

  return `
    <div class="ledger-row">
      <div>
        <div class="ledger-row-title">${escapeHtml(entry.summary)}</div>
        <div class="ledger-row-meta">${escapeHtml(entry.mode)} / ${formatRelativeTime(entry.ts)}</div>
      </div>
      <div class="ledger-row-side">${escapeHtml(side)}</div>
    </div>
  `;
}
