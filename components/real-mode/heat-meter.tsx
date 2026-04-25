"use client";

export function HeatMeter({ heat, loading = false }: { heat: number; loading?: boolean }) {
  const clamped = Math.max(0, Math.min(100, heat));
  const label = clamped >= 80 ? "hot" : clamped >= 50 ? "warm" : clamped >= 20 ? "tense" : "calm";
  const color = clamped >= 80 ? "var(--coral)" : clamped >= 50 ? "var(--surface-accent)" : "var(--sage)";

  return (
    <div className="heat-meter" style={{ opacity: loading ? 0.55 : 1 }}>
      <span>heat</span>
      <div className="heat-meter__bar">
        <div className="heat-meter__fill" style={{ width: `${clamped}%`, background: color }} />
      </div>
      <strong style={{ color }}>{label} · {clamped}</strong>
    </div>
  );
}

