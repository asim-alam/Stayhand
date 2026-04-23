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
  if (!open) {
    return null;
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(event) => event.stopPropagation()}>
        <div className="row spread">
          <div>
            <div className="eyebrow">Why this appeared</div>
            <h3>Explainability</h3>
          </div>
          <button className="button ghost" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="drawer-section">
          <strong>Signals detected</strong>
          <div className="signal-list">
            {moment.riskSignals.map((signal) => (
              <div key={signal.id} className={`signal-chip ${signal.severity}`}>
                <span>{signal.label}</span>
                <small>{signal.detail}</small>
              </div>
            ))}
          </div>
        </div>

        <div className="drawer-section">
          <strong>Recommendation</strong>
          <p>{assessment.reflectionPrompt}</p>
          <div className="stack">
            {assessment.alternativeChoices.map((choice) => (
              <div key={choice} className="note">
                {choice}
              </div>
            ))}
          </div>
        </div>

        <div className="drawer-section">
          <strong>Trace</strong>
          <div className="stack">
            {trace.map((entry) => (
              <div key={entry.id} className="trace">
                <div className="row spread">
                  <strong>{entry.title}</strong>
                  <span>{new Date(entry.at).toLocaleTimeString()}</span>
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
