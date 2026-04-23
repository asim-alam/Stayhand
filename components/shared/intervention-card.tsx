import type { Assessment, DemoAction } from "@/lib/core/types";

export function InterventionCard({
  assessment,
  busy,
  onAction,
}: {
  assessment: Assessment;
  busy: boolean;
  onAction: (action: DemoAction) => void;
}) {
  return (
    <section className="pause-card">
      <div className="eyebrow">Intentional pause</div>
      <h2>{assessment.headline}</h2>
      <p className="lede">{assessment.whyNow}</p>

      <div className="reason-stack">
        {assessment.reasons.map((reason) => (
          <div key={reason} className="reason-row">
            <span className="reason-dot" />
            <span>{reason}</span>
          </div>
        ))}
      </div>

      <div className="ai-panel">
        <div className="row spread">
          <strong>AI suggestion</strong>
          <span className={`status-pill ${assessment.aiLive ? "live" : ""}`}>
            {assessment.aiLive ? `AI live${assessment.aiModel ? ` | ${assessment.aiModel}` : ""}` : "Deterministic fallback"}
          </span>
        </div>
        <div className="ai-copy">{assessment.aiSuggestion}</div>
      </div>

      {assessment.cooldownSeconds ? (
        <div className="cooldown-card">
          <div className="eyebrow">Cooling prompt</div>
          <strong>{assessment.cooldownSeconds}-second pause suggested</strong>
          <span>Short delays improve decisions most when heat and urgency spike together.</span>
        </div>
      ) : null}

      <div className="action-cluster">
        {assessment.recommendedActions.map((action) => (
          <button
            key={action.id}
            className={`action-button ${action.primary ? "primary" : ""} ${action.tone === "danger" ? "danger" : ""}`}
            onClick={() => onAction(action)}
            disabled={busy}
          >
            <strong>{action.label}</strong>
            <span>{action.detail}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
