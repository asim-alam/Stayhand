"use client";

import { useSearchParams } from "next/navigation";
import { startTransition, useEffect, useState } from "react";
import { ExplainabilityDrawer } from "@/components/shared/explainability-drawer";
import { InterventionCard } from "@/components/shared/intervention-card";
import type { DemoAction, MomentSnapshot, MomentSurface, ScenarioFixture } from "@/lib/core/types";
import { SURFACE_META } from "@/lib/scenarios/catalog";

type SnapshotResponse = {
  success: boolean;
  snapshot: MomentSnapshot;
};

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }
  return data as T;
}

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
      const data = await postJson<SnapshotResponse>("/api/moments/start", {
        surface,
        scenarioId,
        judgeMode,
      });
      startTransition(() => setSnapshot(data.snapshot));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not load this moment.");
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
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "That action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleReset() {
    try {
      setBusy(true);
      await postJson("/api/moments/reset", { judgeMode });
      await loadMoment();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Reset failed.");
    } finally {
      setBusy(false);
    }
  }

  const moment = snapshot?.moment;
  const outcome = snapshot?.outcome;

  return (
    <div className="demo-shell">
      <div className="product-topbar">
        <a href="/demo" className="top-link">
          Scenario picker
        </a>
        <div className="row">
          {snapshot?.judgeMode ? <span className="status-pill live">Judge demo mode</span> : null}
          <a href="/ops" className="top-link subtle">
            Ops proof
          </a>
          <button className="button ghost" onClick={() => void handleReset()} disabled={busy}>
            Reset demo
          </button>
        </div>
      </div>

      <section className="moment-hero">
        <div className="eyebrow">{surfaceMeta.eyebrow}</div>
        <h1>{moment?.title || "Loading moment..."}</h1>
        <p>{moment ? surfaceMeta.oneLiner : "Preparing a deterministic friction moment."}</p>
        <div className="scenario-switcher">
          {scenarios.map((scenario) => (
            <a
              key={scenario.id}
              href={`/demo/${surface}?scenario=${scenario.id}${judgeMode ? "&judge=1" : ""}`}
              className={`scenario-pill ${scenario.id === (scenarioId || scenarios[0]?.id) ? "active" : ""}`}
            >
              {scenario.title}
            </a>
          ))}
        </div>
      </section>

      {error ? <div className="banner error">{error}</div> : null}

      {moment && snapshot ? (
        <>
          <div className="consumer-grid">
            <section className="story-card">
              <div className="row spread">
                <div>
                  <div className="eyebrow">{surfaceMeta.label} moment</div>
                  <h2>{moment.context.channel}</h2>
                </div>
                <button className="button ghost" onClick={() => setDrawerOpen(true)}>
                  Why this pause?
                </button>
              </div>

              <div className="signal-meter">
                <div className="meter-bar">
                  <span style={{ width: `${moment.riskScore}%` }} />
                </div>
                <div className="row spread">
                  <span>Risk score {moment.riskScore}</span>
                  <span>{moment.confidence}% confidence</span>
                </div>
              </div>

              {moment.context.incomingMessage ? (
                <div className="message-block inbound">
                  <div className="eyebrow">Incoming</div>
                  <p>{moment.context.incomingMessage}</p>
                </div>
              ) : null}

              <div className="message-block">
                <div className="eyebrow">
                  {outcome && moment.context.originalContent
                    ? "Safer version"
                    : scenarios.find((item) => item.id === moment.scenarioId)?.originalLabel || "Current draft"}
                </div>
                <p>{moment.content}</p>
              </div>

              {moment.context.originalContent && moment.context.originalContent !== moment.content ? (
                <div className="before-after">
                  <div className="compare-card">
                    <div className="eyebrow">Before</div>
                    <p>{moment.context.originalContent}</p>
                  </div>
                  <div className="compare-card">
                    <div className="eyebrow">After</div>
                    <p>{moment.content}</p>
                  </div>
                </div>
              ) : null}

              <div className="detail-grid">
                {moment.context.recipient ? <Detail label="Recipient" value={moment.context.recipient} /> : null}
                {moment.context.merchant ? <Detail label="Merchant" value={moment.context.merchant} /> : null}
                {moment.context.amount ? (
                  <Detail label="Amount" value={`${moment.context.currency || "USD"} ${moment.context.amount}`} />
                ) : null}
                {moment.context.timing ? <Detail label="Timing" value={moment.context.timing} /> : null}
                {moment.context.incomingTone ? <Detail label="Incoming tone" value={moment.context.incomingTone} /> : null}
                {moment.context.draftTone ? <Detail label="Draft tone" value={moment.context.draftTone} /> : null}
              </div>

              <div className="stack">
                {(moment.context.goals || []).length ? (
                  <div className="note">
                    <strong>Goals in memory</strong>
                    <span>{moment.context.goals?.join(" | ")}</span>
                  </div>
                ) : null}
                {(moment.context.history || []).length ? (
                  <div className="note">
                    <strong>Recent context</strong>
                    <span>{moment.context.history?.join(" | ")}</span>
                  </div>
                ) : null}
              </div>
            </section>

            <InterventionCard assessment={snapshot.assessment} busy={busy} onAction={handleAction} />
          </div>

          {outcome ? (
            <section className="outcome-card">
              <div className="eyebrow">Outcome</div>
              <h2>{outcome.summary}</h2>
              <div className="outcome-grid">
                <Metric label="Changed original" value={outcome.changedOriginal ? "Yes" : "No"} />
                <Metric label="Value saved" value={typeof outcome.estimatedValueSaved === "number" ? `$${outcome.estimatedValueSaved}` : "n/a"} />
                <Metric label="Heat reduced" value={typeof outcome.heatReduced === "number" ? `${outcome.heatReduced}%` : "n/a"} />
                <Metric label="Decision delta" value={typeof outcome.decisionQualityDelta === "number" ? `+${outcome.decisionQualityDelta}` : "n/a"} />
              </div>
              <div className="row">
                <a href="/results" className="button primary">
                  View results
                </a>
                {snapshot.judgeMode && snapshot.nextSurface ? (
                  <a href={`/demo/${snapshot.nextSurface}?judge=1`} className="button ghost">
                    Next: {SURFACE_META[snapshot.nextSurface].label}
                  </a>
                ) : null}
              </div>
            </section>
          ) : null}

          <ExplainabilityDrawer
            open={drawerOpen}
            moment={moment}
            assessment={snapshot.assessment}
            trace={snapshot.trace}
            onClose={() => setDrawerOpen(false)}
          />
        </>
      ) : (
        <section className="story-card empty-state">
          <h2>Loading a deterministic demo moment</h2>
          <p>Stayhand is preparing a seeded scenario with rules-first friction and AI assistance.</p>
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
