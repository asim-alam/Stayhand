import type { Assessment, DemoAction, MomentSurface } from "@/lib/core/types";

export function InterventionCard({
  assessment,
  surface,
  busy,
  onAction,
}: {
  assessment: Assessment;
  surface: MomentSurface;
  busy: boolean;
  onAction: (action: DemoAction) => void;
}) {
  const isHighRisk = assessment.cooldownSeconds && assessment.cooldownSeconds > 0;
  const showSaferDraft = surface === "send" && assessment.aiSuggestion.trim().length > 0;

  return (
    <section className={`pause-card ${isHighRisk ? "glow-amber" : ""}`}>
      <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <img src="/logo.png" alt="" style={{ width: 14, height: 14 }} />
        Stayhand — Intentional Pause
      </div>
      <h2>{assessment.headline}</h2>
      <p className="lede">{assessment.whyNow}</p>

      {/* Risk reasons */}
      <div className="reason-stack">
        {assessment.reasons.map((reason, i) => (
          <div key={reason} className="reason-row animate-in" style={{ animationDelay: `${i * 100}ms` }}>
            <span className="reason-dot" />
            <span>{reason}</span>
          </div>
        ))}
      </div>

      {showSaferDraft && (
        <div className="safer-draft-panel demo-safer-draft">
          <div className="row spread">
            <div>
              <div className="eyebrow">Safer draft</div>
              <strong>Preview before rewriting</strong>
            </div>
            <span className={`status-pill ${assessment.aiLive ? "live" : ""}`}>
              {assessment.aiLive ? "AI live" : "fallback"}
            </span>
          </div>
          <p>{assessment.aiSuggestion}</p>
          <ul className="change-summary-list">
            {assessment.suggestionChanges.map((change) => (
              <li key={change}>{change}</li>
            ))}
          </ul>
        </div>
      )}

      {/* AI panel */}
      <div className="ai-panel">
        <div className="row spread">
          <strong style={{ fontSize: "0.85rem" }}>{showSaferDraft ? "Why this helps" : "🤖 AI Suggestion"}</strong>
          <span className={`status-pill ${assessment.aiLive ? "live" : ""}`}>
            {assessment.aiLive
              ? `AI live${assessment.aiModel ? ` · ${assessment.aiModel}` : ""}`
              : "Deterministic fallback"}
          </span>
        </div>
        <div className="ai-copy">{showSaferDraft ? assessment.reflectionPrompt : assessment.aiSuggestion}</div>
      </div>

      {/* Cooldown prompt */}
      {assessment.cooldownSeconds ? (
        <div className="cooldown-card">
          <div className="eyebrow">⏱ Cooling prompt</div>
          <strong>{assessment.cooldownSeconds}-second pause suggested</strong>
          <span>Short delays improve decisions most when heat and urgency spike together.</span>
        </div>
      ) : null}

      {/* Action buttons — primary is easy, danger is deliberately harder */}
      <div className="action-cluster">
        {assessment.recommendedActions.map((action) => (
          <button
            key={action.id}
            className={`action-button ${action.primary ? "primary" : ""} ${action.tone === "danger" ? "danger" : ""}`}
            onClick={() => onAction(action)}
            disabled={busy}
            style={action.tone === "danger" ? { fontSize: "0.85rem", padding: "12px 16px" } : undefined}
          >
            <strong>{action.label}</strong>
            <span>{action.detail}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
