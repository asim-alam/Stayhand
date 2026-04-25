"use client";

import { useEffect, useState } from "react";
import type { SessionResult } from "@/lib/core/types";
import { SURFACE_META } from "@/lib/scenarios/catalog";

const SURFACE_ICONS: Record<string, string> = { send: "✉️", buy: "🛒", reply: "💬" };

export function ResultsDashboard() {
  const [result, setResult] = useState<SessionResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/results/session", { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load results.");
        setResult(data.result as SessionResult);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load results."));
  }, []);

  return (
    <div className="demo-shell">
      <div className="product-topbar">
        <div className="row" style={{ gap: 16 }}>
          <a href="/" className="top-link site-header__brand-link" style={{ textDecoration: 'none' }}>
            <img src="/logo.png" alt="" style={{ width: 22, height: 22, marginRight: 8, borderRadius: 4, verticalAlign: 'middle', boxShadow: '0 0 20px rgba(240, 161, 58, 0.1)' }} />
            <span><span style={{ color: 'var(--amber)' }}>Stay</span>hand</span>
          </a>
          <a href="/demo" className="top-link subtle">← Scenarios</a>
        </div>
        <span className="top-link subtle">Session report</span>
      </div>

      <section className="moment-hero">
        <div className="eyebrow" style={{ color: "var(--sage)" }}>✓ Session outcomes</div>
        <h1>Did the pause improve the decision?</h1>
        <p>Every friction moment is logged. Here&apos;s what Stayhand caught, why, and what changed.</p>
      </section>

      {error && <div className="banner error">{error}</div>}

      {result && result.completed.length > 0 ? (
        <>
          <section className="results-metrics" style={{ marginBottom: 28 }}>
            <StatCard label="Moments completed" value={String(result.metrics.completedMoments)} color="var(--amber)" />
            <StatCard label="Originals changed" value={String(result.metrics.revisedMoments)} color="var(--indigo)" />
            <StatCard label="Value protected" value={`$${result.metrics.totalEstimatedValueSaved}`} color="var(--sage)" />
            <StatCard label="Heat reduced" value={`${result.metrics.totalHeatReduced}%`} color="var(--coral)" />
          </section>

          <div className="results-list">
            {result.completed.map((item, i) => (
              <article
                key={`${item.surface}-${item.title}`}
                className="result-card animate-in"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="row spread" style={{ marginBottom: 8 }}>
                  <div className="eyebrow">{SURFACE_ICONS[item.surface]} {SURFACE_META[item.surface].label}</div>
                  <span className="status-pill live" style={{ fontSize: "0.7rem" }}>Resolved</span>
                </div>
                <h2>{item.title}</h2>
                <p style={{ margin: "8px 0 16px" }}>{item.outcome.summary}</p>
                <div className="stack">
                  <div className="note">
                    <strong>Why the pause appeared</strong>
                    <span>{item.assessment.whyNow}</span>
                  </div>
                  <div className="note">
                    <strong>AI suggestion</strong>
                    <span>{item.assessment.aiSuggestion}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div style={{ textAlign: "center", marginTop: 40 }}>
            <a href="/demo" className="button primary">Run more scenarios →</a>
          </div>
        </>
      ) : (
        <section className="story-card empty-state animate-in">
          <h2 style={{ marginBottom: 12 }}>No completed moments yet</h2>
          <p style={{ color: "var(--muted)", marginBottom: 20 }}>
            Run one of the three demo scenarios and Stayhand will summarize the outcome here.
          </p>
          <a href="/demo" className="button primary">Start the demo →</a>
        </section>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="metric-card" style={{ borderTop: `3px solid ${color}` }}>
      <span>{label}</span>
      <strong style={{ color }}>{value}</strong>
    </div>
  );
}
