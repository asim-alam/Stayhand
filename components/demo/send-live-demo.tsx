"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SurfaceTopbar } from "@/components/real-mode/surface-topbar";
import { CooldownRing } from "@/components/shared/cooldown-ring";
import type { RealModeSurface, SendAnalyzeResult } from "@/lib/real-mode/types";

type SendResponse = {
  result: SendAnalyzeResult;
  live: boolean;
  model: string | null;
  originalDraft: string;
};

const SEEDED_CONTEXT = "Late-night work email after a tense client escalation. Jordan owns the launch handoff; the client is already anxious.";
const SEEDED_INTENT = "Get Jordan to own the miss and agree on a clear repair plan without making tomorrow harder.";
const SEEDED_DRAFT = `Jordan, I need to be direct because the client escalation tonight was avoidable. We had this handoff documented, and you still pushed the rollout without checking the final notes or warning the rest of us. Now I am the one explaining the mess at 11:40 PM. This is exactly the pattern that keeps putting the team in cleanup mode. Please fix the client update before morning, send me the revised timeline, and do not make me chase this again when we already agreed on the process.`;

function getRiskScore(seconds: number): number {
  return Math.max(25, Math.min(100, Math.round(25 + ((seconds - 30) / 270) * 75)));
}

function getRiskLabel(score: number): string {
  if (score >= 76) return "high heat";
  if (score >= 52) return "active risk";
  return "watch zone";
}

function getDemoSurfaceHref(surface: RealModeSurface, judge: boolean) {
  return `/demo/${surface}${judge ? "?judge=1" : ""}`;
}

export function SendLiveDemo() {
  const searchParams = useSearchParams();
  const judgeMode = searchParams.get("judge") === "1";
  const [draft, setDraft] = useState(SEEDED_DRAFT);
  const [intent, setIntent] = useState(SEEDED_INTENT);
  const [response, setResponse] = useState<SendResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [totalCooldown, setTotalCooldown] = useState(60);
  const [saferApplied, setSaferApplied] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const [outcome, setOutcome] = useState<string | null>(null);

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = window.setInterval(() => {
      setRemaining((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [remaining]);

  const cooldownLabel = useMemo(() => {
    if (remaining <= 0) return "0s";
    if (remaining < 60) return `${remaining}s`;
    return `${Math.ceil(remaining / 60)}m`;
  }, [remaining]);

  const ready = remaining <= 0;
  const riskScore = getRiskScore(totalCooldown);
  const riskLabel = getRiskLabel(riskScore);

  async function analyzeDraft() {
    if (!draft.trim()) return;
    setLoading(true);
    setOutcome(null);
    setResponse(null);
    setSaferApplied(false);
    setCopyStatus("");

    try {
      const fetchResponse = await fetch("/api/send/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft,
          type: "send",
          tone: "friend",
          context: [`Context: ${SEEDED_CONTEXT}`, `Desired outcome: ${intent}`].join("\n"),
        }),
      });
      const data = (await fetchResponse.json()) as Partial<SendResponse> & { error?: string };
      if (!fetchResponse.ok || !data.result) {
        throw new Error(data.error || "failed to analyze");
      }

      const cooldown = Math.min(300, Math.max(30, data.result.recommended_cooldown_seconds));
      setResponse({
        result: data.result,
        live: Boolean(data.live),
        model: data.model ?? null,
        originalDraft: draft,
      });
      setTotalCooldown(cooldown);
      setRemaining(cooldown);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "failed to analyze send draft");
    } finally {
      setLoading(false);
    }
  }

  function applySaferDraft() {
    if (!response) return;
    setDraft(response.result.improved_draft);
    setSaferApplied(true);
    setCopyStatus("");
  }

  function keepOriginalDraft() {
    if (!response) return;
    setDraft(response.originalDraft);
    setSaferApplied(false);
    setCopyStatus("");
  }

  async function copySaferDraft() {
    if (!response) return;
    try {
      await navigator.clipboard.writeText(response.result.improved_draft);
      setCopyStatus("Safer draft copied.");
    } catch {
      setCopyStatus("Copy failed. Select the safer draft text manually.");
    }
  }

  function chooseOutcome(choice: "let_go" | "edit" | "proceed") {
    if (!ready) {
      window.alert("The pause is still running.");
      return;
    }
    setOutcome(
      choice === "let_go"
        ? "Let it go. Friction won."
        : choice === "edit"
          ? saferApplied ? "Edit the safer draft before sending." : "Edit it. Future-you says thanks."
          : saferApplied ? "Proceeding with the safer draft." : "Proceeding — eyes open."
    );

    window.setTimeout(() => {
      if (judgeMode) {
        window.location.href = "/demo/buy?judge=1";
      } else {
        setResponse(null);
        setRemaining(0);
        setOutcome(null);
        setDraft(SEEDED_DRAFT);
      }
    }, 2600);
  }

  if (outcome) {
    return (
      <main className="real-shell" data-surface="send">
        <SurfaceTopbar surface="send" modeLabel="demo mode" actionHref="/send" actionLabel="Open live" />
        <section className="real-card real-card--accent cooldown-panel animate-in" style={{ marginTop: 48 }}>
          <h2 style={{ fontFamily: "'Instrument Serif', serif", fontSize: "2.2rem", fontWeight: 400 }}>{outcome}</h2>
          <p className="lede">The point of the pause is not obedience. It is clarity.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="real-shell demo-send-shell" data-surface="send">
      <SurfaceTopbar
        surface="send"
        modeLabel="demo mode"
        actionHref="/send"
        actionLabel="Open live"
        getSurfaceHref={(s) => getDemoSurfaceHref(s, judgeMode)}
      />

      <section className="surface-hero">
        <div className="eyebrow">Before send demo</div>
        <h1>Same pause, seeded for judges.</h1>
        <p>A tense work email is already drafted. Click review to see the live send flow without typing.</p>
        <div className="surface-hero__meta">
          <span className="surface-chip"><strong>type</strong> send</span>
          <span className="surface-chip"><strong>voice</strong> frank friend</span>
          <span className="surface-chip"><strong>context</strong> late-night escalation</span>
        </div>
      </section>

      {!response ? (
        <div className="real-grid two-up">
          <section className="real-card real-card--accent send-demo-composer">
            <div>
              <div className="eyebrow">Prefilled composer</div>
              <h2>Review the message before it leaves.</h2>
            </div>
            <label className="real-label">
              The message
              <textarea className="real-textarea" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={5000} />
              <span className="count-note">{draft.length} / 5000</span>
            </label>
            <label className="real-label">
              Desired outcome
              <textarea
                className="real-textarea"
                value={intent}
                onChange={(event) => setIntent(event.target.value)}
                style={{ minHeight: 74 }}
              />
            </label>
            <button type="button" className="button primary" onClick={() => void analyzeDraft()} disabled={loading || !draft.trim()}>
              {loading ? "Thinking with you..." : "Have a second thought"}
            </button>
          </section>

          <aside className="real-card">
            <div>
              <div className="eyebrow">Demo setup</div>
              <h2>What the analyzer sees.</h2>
            </div>
            <div className="action-grid">
              <article className="action-tile">
                <strong>Draft risk</strong>
                <span>Valid concern mixed with blame, urgency, and a fragile teammate relationship.</span>
              </article>
              <article className="action-tile">
                <strong>Context</strong>
                <span>{SEEDED_CONTEXT}</span>
              </article>
              <article className="action-tile">
                <strong>Result</strong>
                <span>Summary, safer draft, diff, questions, and a short pause before final action.</span>
              </article>
            </div>
          </aside>
        </div>
      ) : (
        <div className="real-grid">
          <div className="row spread">
            <button type="button" className="button ghost" onClick={() => { setResponse(null); setRemaining(0); setOutcome(null); }}>
              Back to composer
            </button>
            <span className="surface-chip">
              <strong>{response.live ? "live ai" : "fallback"}</strong>
              {response.model || "deterministic"}
            </span>
          </div>

          <section className="real-card send-risk-panel">
            <div className="row spread">
              <div>
                <div className="eyebrow">Risk heat</div>
                <h2>{riskLabel}</h2>
              </div>
              <span className="surface-chip">
                <strong>{riskScore}%</strong>
                {totalCooldown}s pause
              </span>
            </div>
            <div className="signal-meter" aria-label={`Risk heat ${riskScore} percent`}>
              <div className="meter-bar">
                <span style={{ width: `${riskScore}%` }} />
              </div>
              <span className="real-help">Estimated from the pause length and risk language.</span>
            </div>
          </section>

          <div className="real-grid two-up">
            <section className="real-card real-card--accent send-result-card">
              <div>
                <div className="eyebrow">Honest summary</div>
                <h2 style={{ fontFamily: "'Instrument Serif', serif", fontSize: "1.9rem", lineHeight: 1.12, fontWeight: 400 }}>
                  {response.result.honest_summary}
                </h2>
              </div>
              <div className={`safer-draft-panel ${saferApplied ? "is-applied" : ""}`}>
                <div className="row spread">
                  <div>
                    <div className="eyebrow">Safer draft</div>
                    <strong>{saferApplied ? "Applied to demo composer" : "Ready if you want it"}</strong>
                  </div>
                  {saferApplied && <span className="status-pill live">applied</span>}
                </div>
                <p>{response.result.improved_draft}</p>
                <div className="safer-draft-actions">
                  <button type="button" className="button primary" onClick={applySaferDraft} disabled={saferApplied}>
                    Apply safer draft
                  </button>
                  <button type="button" className="button ghost" onClick={keepOriginalDraft}>
                    Keep original
                  </button>
                  <button type="button" className="button ghost" onClick={() => void copySaferDraft()}>
                    Copy safer draft
                  </button>
                </div>
                {copyStatus && <span className="real-help">{copyStatus}</span>}
              </div>
              {saferApplied && (
                <label className="real-label applied-draft-preview">
                  Composer after apply
                  <textarea className="real-textarea" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={5000} />
                  <span className="real-help">This stays editable before the final choice.</span>
                </label>
              )}
            </section>

            <aside className="real-card">
              <div>
                <div className="eyebrow">Forecast</div>
                <h2>Before the send button works.</h2>
              </div>
              <div className="forecast-grid">
                <article className="forecast-card">
                  <strong>Best case</strong>
                  <p>{response.result.forecast.best_case}</p>
                </article>
                <article className="forecast-card">
                  <strong>Likely case</strong>
                  <p>{response.result.forecast.likely_case}</p>
                </article>
                <article className="forecast-card forecast-card--accent">
                  <strong>Regret case</strong>
                  <p>{response.result.forecast.regret_case}</p>
                </article>
              </div>
              <div className="send-side-insights">
                <div>
                  <div className="eyebrow">What changed</div>
                  <ul className="change-summary-list">
                    {response.result.change_summary.map((change) => (
                      <li key={change}>{change}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="eyebrow">Three questions</div>
                  <ol className="question-list">
                    {response.result.questions.map((question, index) => (
                      <li key={question}>
                        <span>{index + 1}.</span>
                        <div>{question}</div>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </aside>
          </div>

          <section className="real-card send-compare-card">
            <div className="row spread">
              <div>
                <div className="eyebrow">Before / after</div>
                <h2>See the tone shift side by side.</h2>
              </div>
              <span className="surface-chip send-compare-chip">
                <strong>diff view</strong>
                original vs safer
              </span>
            </div>
            <div className="before-after send-before-after">
              <article className="compare-card compare-card--before">
                <div className="eyebrow">Before</div>
                <p>{response.originalDraft}</p>
              </article>
              <article className="compare-card compare-card--after">
                <div className="eyebrow">After</div>
                <p>{response.result.improved_draft}</p>
              </article>
            </div>
          </section>

          <section className="real-card cooldown-panel">
            <CooldownRing remaining={remaining} total={totalCooldown} />
            <p className="lede">
              {ready ? "The pause is over. Choose what happens next." : <>Hold for <strong style={{ color: "var(--text)" }}>{cooldownLabel}</strong>.</>}
            </p>
            <div className="action-grid send-decision-grid">
              <button type="button" className="button ghost" disabled={!ready} onClick={() => chooseOutcome("let_go")}>
                Let it go
              </button>
              <button type="button" className="button ghost" disabled={!ready} onClick={() => chooseOutcome("edit")}>
                Edit it
              </button>
              <button type="button" className="button primary" disabled={!ready} onClick={() => chooseOutcome("proceed")}>
                Proceed
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
