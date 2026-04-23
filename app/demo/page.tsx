import { listScenarios, SURFACE_META } from "@/lib/scenarios/catalog";

export default function DemoPage() {
  const surfaces = ["send", "buy", "reply"] as const;

  return (
    <main className="marketing-page">
      <section className="landing-hero compact">
        <div className="hero-copy">
          <div className="eyebrow">Scenario picker</div>
          <h1>Choose one risky moment.</h1>
          <p>Lead with a clear story: message regret, purchase regret, or reply regret. Every path is deterministic and demo-safe.</p>
          <div className="hero-actions">
            <a href="/demo/send?judge=1" className="button primary">
              Start judge demo
            </a>
            <a href="/results" className="button ghost">
              View results
            </a>
          </div>
        </div>
      </section>

      <section className="surface-strip stack-grid">
        {surfaces.map((surface) => {
          const featured = listScenarios(surface)[0];
          return (
            <article key={surface} className="surface-card large">
              <div className="eyebrow">{SURFACE_META[surface].eyebrow}</div>
              <h2>{SURFACE_META[surface].label}</h2>
              <p>{SURFACE_META[surface].oneLiner}</p>
              <div className="note">
                <strong>Featured moment</strong>
                <span>{featured.title}</span>
              </div>
              <div className="row">
                <a href={`/demo/${surface}?scenario=${featured.id}`} className="button primary">
                  Open {SURFACE_META[surface].label}
                </a>
                <a href={`/demo/${surface}?scenario=${featured.id}&judge=1`} className="button ghost">
                  Use in judge mode
                </a>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
