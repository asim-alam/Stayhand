export async function getBootstrap() {
  return getJson("/api/bootstrap");
}

export async function toggleConnector(id) {
  return postJson("/api/connectors/toggle", { id });
}

export async function evaluateEvent(eventId) {
  return postJson("/api/interventions/evaluate", { eventId });
}

export async function applyIntervention(eventId, action) {
  return postJson("/api/interventions/apply", { eventId, action });
}

export async function simulateEvent(connectorId) {
  return postJson("/api/events/simulate", { connectorId });
}

export async function queryContext(tabId, queryId, params = {}) {
  return postJson("/api/context/query", { tabId, queryId, params });
}

export async function runCommand(prompt, eventId, connectorId) {
  return postJson("/api/command/run", { prompt, eventId, connectorId });
}

export function openStream(handlers) {
  const source = new EventSource("/api/events/stream");
  ["bootstrap", "event", "connector", "evaluation", "ledger", "heartbeat"].forEach((eventName) => {
    source.addEventListener(eventName, (event) => {
      try {
        const payload = JSON.parse(event.data);
        handlers[eventName]?.(payload);
      } catch {
        // Ignore malformed stream payloads.
      }
    });
  });
  source.onerror = () => handlers.error?.();
  source.onopen = () => handlers.open?.();
  return source;
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  return response.json();
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  return response.json();
}
