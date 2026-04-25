import { SiteHeader } from "@/components/shared/site-header";
import { listScenarios, SURFACE_META } from "@/lib/scenarios/catalog";

const SURFACE_ICONS: Record<string, string> = { send: "✉️", buy: "🛒", reply: "💬" };

export default function DemoPage() {
  const surfaces = ["send", "buy", "reply"] as const;

  return (
    <main className="marketing-page">
      <SiteHeader active="demo" />

      <section className="landing-hero compact">
        <div className="hero-copy">
          <div className="eyebrow">Seeded demo</div>
          <h1>The same product model. Deterministic inputs instead of live drafts.</h1>
          <p>
            Demo mode should feel like real mode with training wheels on: same surfaces, same intervention logic,
            same safer-version decisions, but with replayable scenarios judges can run in any order.
          </p>
          <div className="hero-actions">
            <a href="/demo/send?judge=1" className="button primary">
              Try the demo →
            </a>
            <a href="/send" className="button ghost">
              Try Live App
            </a>
          </div>
        </div>
      </section>

      <section className="surface-strip stack-grid" style={{ gridTemplateColumns: "1fr" }}>
        {surfaces.map((surface) => {
          const featured = listScenarios(surface)[0];
          const allScenarios = listScenarios(surface);
          return (
            <article key={surface} className="surface-card" style={{ gridTemplateColumns: "1fr auto", alignItems: "center" }}>
              <div style={{ display: "grid", gap: 12 }}>
                <div className="eyebrow">{SURFACE_ICONS[surface]} {SURFACE_META[surface].eyebrow}</div>
                <h2>{SURFACE_META[surface].label}</h2>
                <p>{SURFACE_META[surface].oneLiner}</p>
                <div className="note" style={{ maxWidth: 480 }}>
                  <strong>Featured: {featured.title}</strong>
                  <span>{featured.summary} This models the live <a href={`/${surface}`} className="top-link" style={{ color: "var(--amber)" }}>/{surface}</a> flow with seeded input.</span>
                </div>
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                <a href={`/demo/${surface}?scenario=${featured.id}`} className="button primary">
                  Open {SURFACE_META[surface].label}
                </a>
                <a href={`/${surface}`} className="button ghost">
                  Try live
                </a>
                {allScenarios.length > 1 && (
                  <span style={{ fontSize: "0.8rem", color: "var(--muted)", textAlign: "center" }}>
                    +{allScenarios.length - 1} more scenario{allScenarios.length > 2 ? "s" : ""}
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
