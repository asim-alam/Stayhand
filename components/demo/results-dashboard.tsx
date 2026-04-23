"use client";

import { useEffect, useState } from "react";
import type { SessionResult } from "@/lib/core/types";
import { SURFACE_META } from "@/lib/scenarios/catalog";

export function ResultsDashboard() {
  const [result, setResult] = useState<SessionResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/results/session", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to load results.");
        setResult(data.result as SessionResult);
      })
      .catch((nextError) => {
        setError(nextError instanceof Error ? nextError.message : "Failed to load results.");
      });
  }, []);

  return (
    <div className="demo-shell">
      <div className="product-topbar">
        <a href="/demo" className="top-link">
          Back to scenarios
        </a>
        <a href="/ops" className="top-link subtle">
          View ops proof
        </a>
      </div>

      <section className="moment-hero">
        <div className="eyebrow">Session outcomes</div>
        <h1>Did the pause improve the decision?</h1>
        <p>Stayhand shows what friction caught, why it appeared, and what changed after the user chose a safer option.</p>
      </section>

      {error ? <div className="banner error">{error}</div> : null}

      {result && result.completed.length ? (
        <>
          <section className="results-metrics">
            <Metric label="Completed moments" value={String(result.metrics.completedMoments)} />
            <Metric label="Changed originals" value={String(result.metrics.revisedMoments)} />
            <Metric label="Estimated value saved" value={`$${result.metrics.totalEstimatedValueSaved}`} />
            <Metric label="Heat reduced" value={`${result.metrics.totalHeatReduced}%`} />
          </section>

          <div className="results-list">
            {result.completed.map((item) => (
              <article key={`${item.surface}-${item.title}`} className="result-card">
                <div className="eyebrow">{SURFACE_META[item.surface].label}</div>
                <h2>{item.title}</h2>
                <p>{item.outcome.summary}</p>
                <div className="stack">
                  <div className="note">
                    <strong>Why the pause appeared</strong>
                    <span>{item.assessment.whyNow}</span>
                  </div>
                  <div className="note">
                    <strong>What the AI suggested</strong>
                    <span>{item.assessment.aiSuggestion}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : (
        <section className="story-card empty-state">
          <h2>No completed moments yet</h2>
          <p>Run one of the three demo scenarios and Stayhand will summarize the outcome here.</p>
          <a href="/demo" className="button primary">
            Start the demo
          </a>
        </section>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
