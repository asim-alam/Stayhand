import { useMemo } from "react";

export function CooldownRing({ remaining, total }: { remaining: number; total: number }) {
  const pct = total > 0 ? Math.max(0, Math.min(1, 1 - remaining / total)) : 1;
  const r = 72;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct);
  
  const label = useMemo(() => {
    if (remaining <= 0) return "go";
    if (remaining < 60) return `${remaining}`;
    if (remaining < 3600) return `${Math.ceil(remaining / 60)}m`;
    return `${Math.ceil(remaining / 3600)}h`;
  }, [remaining]);
  
  const sub = remaining < 60 && remaining > 0 ? "seconds" : "";

  return (
    <div className={`relative ${remaining > 0 ? "glow-amber" : ""}`} style={{ width: 148, height: 148, borderRadius: '50%', margin: '0 auto' }}>
        <svg width="148" height="148" viewBox="0 0 180 180">
        <circle
          cx="90" cy="90" r={r}
          fill="none"
          stroke="var(--border)"
          strokeWidth="2"
        />
        <circle
          cx="90" cy="90" r={r}
          fill="none"
          stroke="var(--amber)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform="rotate(-90 90 90)"
          style={{ transition: "stroke-dashoffset 1s linear" }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: "Instrument Serif, Georgia, serif", fontSize: "2.7rem", color: "var(--text)", lineHeight: 1 }}>{label}</div>
        {sub && <div style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.18em", color: "var(--muted)", marginTop: "8px" }}>{sub}</div>}
      </div>
    </div>
  );
}
