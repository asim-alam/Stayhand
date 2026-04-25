"use client";

import { useSearchParams } from "next/navigation";
import { startTransition, useEffect, useState } from "react";
import { SurfaceTopbar } from "@/components/real-mode/surface-topbar";
import { ExplainabilityDrawer } from "@/components/shared/explainability-drawer";
import { InterventionCard } from "@/components/shared/intervention-card";
import type { DemoAction, MomentSnapshot, MomentSurface, ScenarioFixture } from "@/lib/core/types";
import { SURFACE_META } from "@/lib/scenarios/catalog";

type SnapshotResponse = { success: boolean; snapshot: MomentSnapshot };

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data as T;
}

const SURFACE_ICONS: Record<string, string> = { send: "✉️", buy: "🛒", reply: "💬" };

export function MomentExperience({
  surface,
  scenarios,
}: {
  surface: MomentSurface;
  scenarios: ScenarioFixture[];
}) {
  const searchParams = useSearchParams();
  const scenarioId = searchParams.get("scenario") || undefined;
  const judgeMode = searchParams.get("judge") === "1";
  const surfaceMeta = SURFACE_META[surface];

  const [snapshot, setSnapshot] = useState<MomentSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    void loadMoment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surface, scenarioId, judgeMode]);

  async function loadMoment() {
    try {
      setBusy(true);
      setError("");
      const data = await postJson<SnapshotResponse>("/api/moments/start", { surface, scenarioId, judgeMode });
      startTransition(() => setSnapshot(data.snapshot));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this moment.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAction(action: DemoAction) {
    if (!snapshot) return;
    try {
      setBusy(true);
      setError("");
      const data = action.id === "revise"
        ? await postJson<SnapshotResponse>("/api/moments/revise", { momentId: snapshot.moment.id })
        : await postJson<SnapshotResponse>("/api/moments/continue", { momentId: snapshot.moment.id, action: action.id });
      startTransition(() => setSnapshot(data.snapshot));
    } catch (e) {
      setError(e instanceof Error ? e.message : "That action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleReset() {
    try {
      setBusy(true);
      await postJson("/api/moments/reset", { judgeMode });
      await loadMoment();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reset failed.");
    } finally {
      setBusy(false);
    }
  }

  const moment = snapshot?.moment;
  const outcome = snapshot?.outcome;
  const riskLevel = moment ? (moment.riskScore > 70 ? "high" : moment.riskScore > 40 ? "medium" : "low") : "low";
  const saferPreview = moment && surface === "send"
    ? (moment.status === "revised" ? moment.content : snapshot?.assessment.aiSuggestion)
    : null;

  return (
    <div className="real-shell demo-shell" data-surface={surface}>
      <SurfaceTopbar
        surface={surface}
        modeLabel={snapshot?.judgeMode ? "judge demo" : "demo mode"}
        actionHref={`/${surface}`}
        actionLabel="Try live"
        getSurfaceHref={(item) => `/demo/${item}${judgeMode ? "?judge=1" : ""}`}
      />

      {/* Hero */}
      <section className="moment-hero">
        <div className="eyebrow">{SURFACE_ICONS[surface]} {surfaceMeta.eyebrow}</div>
        <h1>{moment?.title || "Loading moment..."}</h1>
        <p>
          {moment
            ? `${surfaceMeta.oneLiner} This demo mirrors the live /${surface} route with seeded copy and deterministic scoring.`
            : "Preparing a deterministic friction moment."}
        </p>
        <div className="scenario-switcher">
          {scenarios.map((s) => (
            <a
              key={s.id}
              href={`/demo/${surface}?scenario=${s.id}${judgeMode ? "&judge=1" : ""}`}
              className={`scenario-pill ${s.id === (scenarioId || scenarios[0]?.id) ? "active" : ""}`}
            >
              {s.title}
            </a>
          ))}
        </div>
        <div className="demo-alignment-note">
          <span className="surface-chip"><strong>models</strong> /{surface}</span>
          <span className="surface-chip"><strong>demo only</strong> seeded scenario input and deterministic replay</span>
          <div className="row">
            <a href="/demo" className="button ghost">← Demo picker</a>
            <button className="button ghost" onClick={() => void handleReset()} disabled={busy}>Reset scenario</button>
          </div>
        </div>
      </section>

      {error && <div className="banner error">{error}</div>}

      {moment && snapshot ? (
        <>
          <div className="consumer-grid">
            {/* Left: Story */}
            <section className="story-card animate-in" style={riskLevel === "high" ? { borderColor: "rgba(231,111,81,0.2)" } : undefined}>
              <div className="row spread">
                <div>
                  <div className="eyebrow">{surfaceMeta.label} moment</div>
                  <h2 style={{ marginTop: 4 }}>{moment.context.channel}</h2>
                </div>
                <button className="button ghost" onClick={() => setDrawerOpen(true)}>Why this pause?</button>
              </div>

              {/* Risk meter */}
              <div className="signal-meter">
                <div className="meter-bar">
                  <span style={{ width: `${moment.riskScore}%` }} />
                </div>
                <div className="row spread">
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.85rem" }}>
                    Risk {moment.riskScore}/100
                  </span>
                  <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                    {moment.confidence}% confidence
                  </span>
                </div>
              </div>

              {/* Incoming message */}
              {moment.context.incomingMessage && (
                <div className="message-block inbound">
                  <div className="eyebrow" style={{ color: "var(--indigo)" }}>Incoming</div>
                  <p>{moment.context.incomingMessage}</p>
                </div>
              )}

              {/* Draft / revised content */}
              <div className="message-block" style={outcome ? { borderColor: "rgba(46,155,106,0.2)" } : undefined}>
                <div className="eyebrow">
                  {outcome && moment.context.originalContent
                    ? "✓ Safer version"
                    : scenarios.find((s) => s.id === moment.scenarioId)?.originalLabel || "Current draft"}
                </div>
                <p>{moment.content}</p>
              </div>

              {/* Before/after */}
              {saferPreview && moment.context.originalContent && moment.context.originalContent !== saferPreview && (
                <div className="before-after">
                  <div className="compare-card">
                    <div className="eyebrow" style={{ color: "var(--coral)" }}>Before</div>
                    <p style={{ fontSize: "0.9rem" }}>{moment.context.originalContent}</p>
                  </div>
                  <div className="compare-card" style={{ borderColor: "rgba(46,155,106,0.15)" }}>
                    <div className="eyebrow" style={{ color: "var(--sage)" }}>{moment.status === "revised" ? "After" : "Safer draft"}</div>
                    <p style={{ fontSize: "0.9rem" }}>{saferPreview}</p>
                  </div>
                </div>
              )}

              {/* Context details */}
              <div className="detail-grid">
                {moment.context.recipient && <Detail label="Recipient" value={moment.context.recipient} />}
                {moment.context.merchant && <Detail label="Merchant" value={moment.context.merchant} />}
                {moment.context.amount != null && (
                  <Detail label="Amount" value={`${moment.context.currency || "USD"} ${moment.context.amount}`} />
                )}
                {moment.context.timing && <Detail label="Timing" value={moment.context.timing} />}
                {moment.context.incomingTone && <Detail label="Incoming tone" value={moment.context.incomingTone} />}
                {moment.context.draftTone && <Detail label="Draft tone" value={moment.context.draftTone} />}
              </div>

              {/* Goals & history */}
              <div className="stack">
                {(moment.context.goals || []).length > 0 && (
                  <div className="note">
                    <strong>🎯 Goals in memory</strong>
                    <span>{moment.context.goals?.join(" · ")}</span>
                  </div>
                )}
                {(moment.context.history || []).length > 0 && (
                  <div className="note">
                    <strong>📋 Recent context</strong>
                    <span>{moment.context.history?.join(" · ")}</span>
                  </div>
                )}
              </div>
            </section>

            {/* Right: Intervention */}
            <InterventionCard assessment={snapshot.assessment} surface={surface} busy={busy} onAction={handleAction} />
          </div>

          {/* Outcome */}
          {outcome && (
            <section className="outcome-card animate-in">
              <div className="eyebrow" style={{ color: "var(--sage)" }}>✓ Outcome</div>
              <h2>{outcome.summary}</h2>
              <div className="outcome-grid">
                <Metric label="Changed original" value={outcome.changedOriginal ? "Yes" : "No"} />
                <Metric label="Value saved" value={typeof outcome.estimatedValueSaved === "number" ? `$${outcome.estimatedValueSaved}` : "—"} />
                <Metric label="Heat reduced" value={typeof outcome.heatReduced === "number" ? `${outcome.heatReduced}%` : "—"} />
                <Metric label="Decision delta" value={typeof outcome.decisionQualityDelta === "number" ? `+${outcome.decisionQualityDelta}` : "—"} />
              </div>
              <div className="row">
                <a href="/results" className="button primary">View all results →</a>
                {snapshot.judgeMode && snapshot.nextSurface && (
                  <a href={`/demo/${snapshot.nextSurface}?judge=1`} className="button ghost">
                    Next: {SURFACE_META[snapshot.nextSurface].label} →
                  </a>
                )}
              </div>
            </section>
          )}

          <ExplainabilityDrawer
            open={drawerOpen}
            moment={moment}
            assessment={snapshot.assessment}
            trace={snapshot.trace}
            onClose={() => setDrawerOpen(false)}
          />
        </>
      ) : (
        <section className="story-card empty-state animate-in">
          <h2>Loading…</h2>
          <p style={{ color: "var(--muted)" }}>Preparing a deterministic friction moment.</p>
        </section>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
