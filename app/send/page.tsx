"use client";

import { useEffect, useMemo, useState } from "react";
import { CooldownRing } from "@/components/shared/cooldown-ring";
import { SurfaceTopbar } from "@/components/real-mode/surface-topbar";
import type { SendAnalyzeResult } from "@/lib/real-mode/types";

type DecisionType = "send" | "buy" | "post" | "quit" | "custom";
type Tone = "therapist" | "friend" | "lawyer";

type SendResponse = {
  result: SendAnalyzeResult;
  live: boolean;
  model: string | null;
  originalDraft: string;
};

const TYPES: { id: DecisionType; label: string; sub: string }[] = [
  { id: "send", label: "Send it", sub: "Message · email · DM" },
  { id: "post", label: "Post it", sub: "Public · permanent" },
  { id: "quit", label: "Quit / delete it", sub: "End · remove · leave" },
  { id: "custom", label: "Something else", sub: "Anything you'll question later" },
];

const TONES: { id: Tone; label: string }[] = [
  { id: "therapist", label: "therapist" },
  { id: "friend", label: "frank friend" },
  { id: "lawyer", label: "careful lawyer" },
];

const PLACEHOLDERS: Record<DecisionType, string> = {
  send: "Paste the message exactly as you would send it.",
  buy: "What is it? Why now?",
  post: "Paste the post.",
  quit: "What are you ending? Account, relationship, file, job…",
  custom: "Describe the action.",
};

function getRiskScore(seconds: number): number {
  return Math.max(25, Math.min(100, Math.round(25 + ((seconds - 30) / 270) * 75)));
}

function getRiskLabel(score: number): string {
  if (score >= 76) return "high heat";
  if (score >= 52) return "active risk";
  return "watch zone";
}

export default function SendPage() {
  const [authReady, setAuthReady] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const [type, setType] = useState<DecisionType>("send");
  const [tone, setTone] = useState<Tone>("therapist");
  const [draft, setDraft] = useState("");
  const [context, setContext] = useState("");
  const [intent, setIntent] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<SendResponse | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [totalCooldown, setTotalCooldown] = useState(60);
  const [reason, setReason] = useState("");
  const [outcome, setOutcome] = useState<string | null>(null);
  const [saferApplied, setSaferApplied] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");

  useEffect(() => {
    void fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { user?: { id: string } | null }) => {
        if (!data.user) {
          const callback = encodeURIComponent(window.location.pathname + window.location.search);
          window.location.href = `/login?callbackUrl=${callback}`;
          return;
        }
        setIsAuthed(true);
      })
      .catch(() => {
        const callback = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `/login?callbackUrl=${callback}`;
      })
      .finally(() => {
        setAuthReady(true);
      });
  }, []);

  // Cooldown ticker
  useEffect(() => {
    if (remaining <= 0) return;
    const timer = window.setInterval(() => {
      setRemaining((v) => Math.max(0, v - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [remaining]);

  const cooldownLabel = useMemo(() => {
    if (remaining <= 0) return "0s";
    if (remaining < 60) return `${remaining}s`;
    if (remaining < 3600) return `${Math.ceil(remaining / 60)}m`;
    return `${Math.ceil(remaining / 3600)}h`;
  }, [remaining]);

  // While the auth check is in-flight, render nothing to avoid a flash of the login page.
  if (!authReady) return null;

  // Auth check done — user not signed in; redirect is already in-flight via useEffect.
  if (!isAuthed) return null;

  async function handleAnalyze() {
    if (!draft.trim()) return;
    if (draft.length > 5000) return;
    setLoading(true);
    setOutcome(null);
    setResponse(null);
    const analysisContext = [
      context.trim() ? `Context: ${context.trim()}` : "",
      intent.trim() ? `Desired outcome: ${intent.trim()}` : "",
    ].filter(Boolean).join("\n");

    try {
      const fetchResponse = await fetch("/api/send/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft,
          context: analysisContext || undefined,
          type,
          tone,
          amount: type === "buy" && amount ? Number(amount) : undefined,
        }),
      });

      const data = (await fetchResponse.json()) as Partial<SendResponse> & { error?: string };
      if (!fetchResponse.ok || !data.result) {
        throw new Error(data.error || "failed to analyze");
      }

      const cd = Math.min(60, Math.max(30, data.result.recommended_cooldown_seconds));
      setResponse({
        result: data.result,
        live: Boolean(data.live),
        model: data.model ?? null,
        originalDraft: draft,
      });
      setSaferApplied(false);
      setCopyStatus("");
      setTotalCooldown(cd);
      setRemaining(cd);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "failed to analyze");
    } finally {
      setLoading(false);
    }
  }

  function resetFlow() {
    setDraft("");
    setContext("");
    setIntent("");
    setAmount("");
    setResponse(null);
    setRemaining(0);
    setReason("");
    setOutcome(null);
    setSaferApplied(false);
    setCopyStatus("");
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

  async function logMoment(action: "proceed" | "edit" | "let_go", status: "completed" | "abandoned") {
    if (!response) return;
    
    // Convert choice to unified user_action
    const user_action = action === "proceed" ? (saferApplied ? "used_try" : "sent_original") : action === "edit" ? "edited" : "let_go";

    void fetch("/api/moments/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        surface: "send",
        title: `${type.charAt(0).toUpperCase() + type.slice(1)} decision`,
        status,
        user_action,
        trigger_reason: "High risk cooldown",
        heat_before: getRiskScore(totalCooldown),
        heat_after: action === "proceed" && saferApplied ? 30 : getRiskScore(totalCooldown), // rough estimate for now
        original_input: response.originalDraft,
        ai_review: response.result.honest_summary,
        ai_suggestion: response.result.improved_draft,
        final_output: action === "proceed" ? draft : null,
        payload: {
          decision_type: type,
          forecast: response.result.forecast,
          reason: reason.trim() || null,
        }
      })
    });
  }

  function chooseOutcome(choice: "proceed" | "edit" | "let_go") {
    if (remaining > 0) {
      window.alert("The pause isn't over. That's the point.");
      return;
    }

    void logMoment(choice, choice === "let_go" ? "abandoned" : "completed");

    setOutcome(
      choice === "proceed"
        ? saferApplied ? "Proceeding with the safer draft." : "Proceeding — eyes open."
        : choice === "edit"
          ? saferApplied ? "Edit the safer draft before sending." : "Edit it. Future-you says thanks."
          : "Let it go. Friction won."
    );

    window.setTimeout(() => {
      resetFlow();
    }, 2600);
  }

  // ── Render: outcome flash ──
  if (outcome) {
    return (
      <main className="real-shell" data-surface="send">
        <SurfaceTopbar surface="send" actionHref="/demo/send?scenario=send-coworker-heat" actionLabel="View demo" />
        <section className="real-card real-card--accent cooldown-panel animate-in" style={{ marginTop: 48 }}>
          <h2 style={{ fontFamily: "'Instrument Serif', serif", fontSize: "2.2rem", fontWeight: 400 }}>{outcome}</h2>
          <p className="lede">The point of the pause is not obedience. It is clarity.</p>
        </section>
      </main>
    );
  }

  // ── Render: intake form ──
  if (!response) {
    return (
      <main className="real-shell" data-surface="send">
        <SurfaceTopbar surface="send" actionHref="/demo/send?scenario=send-coworker-heat" actionLabel="View demo" />

        <section className="surface-hero">
          <div className="eyebrow">Before you send</div>
          <h1>What are you about to do?</h1>
          <p>Pick the kind of decision. Be honest with the draft. We don't rewrite — first, honesty.</p>
        </section>

        {/* Decision type grid */}
        <div className="decision-type-grid send-type-grid">
          {TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`decision-type-btn ${type === t.id ? "decision-type-btn--active" : ""}`}
              onClick={() => setType(t.id)}
            >
              <strong>{t.label}</strong>
              <span>{t.sub}</span>
            </button>
          ))}
        </div>

        <div className="real-grid two-up" style={{ marginTop: 20 }}>
          <section className="real-card real-card--accent">
            <div>
              <div className="eyebrow">The draft</div>
              <h2>Paste the exact thing.</h2>
            </div>
            <div className="real-form">
              <label className="real-label">
                {type === "send" ? "The message" : type === "buy" ? "What you're buying" : type === "post" ? "The post" : "The action"}
                <textarea
                  className="real-textarea"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={PLACEHOLDERS[type]}
                  maxLength={5000}
                />
                <div className="count-note">{draft.length} / 5000</div>
              </label>

              {type === "buy" && (
                <label className="real-label">
                  Price (USD)
                  <input
                    className="real-input"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </label>
              )}

              <label className="real-label">
                Context (optional)
                <input
                  className="real-input"
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="Who, why, what just happened"
                />
              </label>

              <label className="real-label">
                Desired outcome
                <input
                  className="real-input"
                  value={intent}
                  onChange={(e) => setIntent(e.target.value)}
                  placeholder="What do you want this message to make possible?"
                />
              </label>

              {/* Tone selector */}
              <div className="tone-selector">
                <span className="tone-selector__label">Voice</span>
                <div className="tone-selector__pills">
                  {TONES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`tone-pill ${tone === t.id ? "tone-pill--active" : ""}`}
                      onClick={() => setTone(t.id)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                className="button primary"
                onClick={handleAnalyze}
                disabled={loading || !draft.trim()}
                style={{ justifyContent: "center", marginTop: 8 }}
              >
                {loading ? "Thinking with you…" : "Have a second thought →"}
              </button>
            </div>
          </section>

          <aside className="real-card">
            <div>
              <div className="eyebrow">What happens here</div>
              <h2>No rewriting yet. First: honesty.</h2>
            </div>
            <div className="action-grid">
              <article className="action-tile">
                <strong>1. Read</strong>
                <span>One sentence on what this message is really doing.</span>
              </article>
              <article className="action-tile">
                <strong>2. Forecast</strong>
                <span>Best, likely, and regret-case before you get to pretend it is neutral.</span>
              </article>
              <article className="action-tile">
                <strong>3. Wait</strong>
                <span>The buttons stay dead until the short cooldown is over.</span>
              </article>
            </div>
            <div className="note">
              <strong>View the deterministic proof instead</strong>
              <span>The demo route shows the same logic on seeded scenarios judges can replay safely.</span>
            </div>
          </aside>
        </div>
      </main>
    );
  }

  // ── Render: results + cooldown ──
  const ready = remaining <= 0;
  const riskScore = getRiskScore(totalCooldown);
  const riskLabel = getRiskLabel(riskScore);

  return (
    <main className="real-shell" data-surface="send">
      <SurfaceTopbar surface="send" actionHref="/demo/send?scenario=send-coworker-heat" actionLabel="View demo" />

      <div className="real-grid">
        <div className="row spread">
          <button type="button" className="button ghost" onClick={() => { setResponse(null); setRemaining(0); setSaferApplied(false); setCopyStatus(""); }}>
            ← Start over
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
          {/* Left: summary + safer draft */}
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
                  <strong>{saferApplied ? "Applied to your composer" : "Ready if you want it"}</strong>
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
                <textarea
                  className="real-textarea"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  maxLength={5000}
                />
                <span className="real-help">You can still tighten this before choosing Edit it or Proceed.</span>
              </label>
            )}
          </section>

          {/* Right: forecast + reflection */}
          <aside className="real-card">
            <div>
              <div className="eyebrow">Future of this {type}</div>
              <h2>Before you reach for the button.</h2>
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

        {/* Cooldown panel */}
        <section className="real-card cooldown-panel">
          <CooldownRing remaining={remaining} total={totalCooldown} />
          <p className="lede">
            {ready
              ? "The pause is over. What's the call?"
              : <>Hold for <strong style={{ color: "var(--text)" }}>{cooldownLabel}</strong>. The button doesn't work until then.</>}
          </p>

          <div className="cooldown-panel__actions">
            <input
              className="real-input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={saferApplied ? "One line: why send the safer draft?" : "One line: why this decision?"}
              disabled={!ready}
            />
            <div className="action-grid send-decision-grid">
              <button
                type="button"
                className="button ghost"
                disabled={!ready}
                onClick={() => chooseOutcome("let_go")}
              >
                ✕ Let it go
              </button>
              <button
                type="button"
                className="button ghost"
                disabled={!ready}
                onClick={() => chooseOutcome("edit")}
              >
                ✎ Edit it
              </button>
              <button
                type="button"
                className="button primary"
                disabled={!ready}
                onClick={() => chooseOutcome("proceed")}
              >
                ✓ Proceed
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
