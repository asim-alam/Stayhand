import type { Assessment, Moment } from "@/lib/core/types";
import type { TraceEntry } from "@/lib/types/runtime";

export function ExplainabilityDrawer({
  open,
  moment,
  assessment,
  trace,
  onClose,
}: {
  open: boolean;
  moment: Moment;
  assessment: Assessment;
  trace: TraceEntry[];
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="row spread">
          <div>
            <div className="eyebrow">Explainability</div>
            <h3>Why this pause appeared</h3>
          </div>
          <button className="button ghost" onClick={onClose}>✕ Close</button>
        </div>

        {/* Risk signals */}
        <div className="drawer-section">
          <strong style={{ color: "var(--amber)" }}>Signals detected</strong>
          <div className="signal-list">
            {moment.riskSignals.map((signal, i) => (
              <div
                key={signal.id}
                className={`signal-chip ${signal.severity} animate-in`}
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <strong style={{ fontSize: "0.9rem" }}>{signal.label}</strong>
                <small style={{ color: "var(--muted)" }}>{signal.detail}</small>
              </div>
            ))}
          </div>
        </div>

        {/* Recommendation */}
        <div className="drawer-section">
          <strong style={{ color: "var(--amber)" }}>Reflection prompt</strong>
          <p style={{ color: "var(--muted)", lineHeight: 1.7 }}>{assessment.reflectionPrompt}</p>
          <div className="stack">
            {assessment.alternativeChoices.map((choice) => (
              <div key={choice} className="note">
                <span>{choice}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Trace */}
        <div className="drawer-section">
          <strong style={{ color: "var(--muted)" }}>Decision trace</strong>
          <div className="stack">
            {trace.map((entry, i) => (
              <div key={entry.id} className="trace animate-in" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="row spread">
                  <strong style={{ fontSize: "0.85rem" }}>{entry.title}</strong>
                  <span style={{ fontSize: "0.75rem", fontFamily: "'JetBrains Mono', monospace" }}>
                    {new Date(entry.at).toLocaleTimeString()}
                  </span>
                </div>
                <span>{entry.detail}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
