import { listScenarios, SURFACE_META } from "@/lib/scenarios/catalog";

export default function MarketingPage() {
  const send = listScenarios("send")[0];
  const buy = listScenarios("buy")[0];
  const reply = listScenarios("reply")[0];

  return (
    <main className="marketing-page">
      <section className="landing-hero">
        <div className="hero-copy">
          <div className="eyebrow">Stayhand</div>
          <h1>Add friction only when risk is high.</h1>
          <p>
            Stayhand helps people avoid regret before they send a heated message, buy under pressure, or reply in a way that makes a situation worse.
          </p>
          <div className="hero-actions">
            <a href="/demo" className="button primary">
              Open demo
            </a>
            <a href="/demo/send?judge=1" className="button ghost">
              Judge demo mode
            </a>
          </div>
        </div>

        <div className="hero-proof">
          <div className="proof-card featured">
            <span className="eyebrow">Product thesis</span>
            <strong>Rules decide when to pause.</strong>
            <p>AI explains why, rewrites the next step, and helps the user choose a safer option without removing control.</p>
          </div>
          <div className="proof-card">
            <span className="eyebrow">Demo promise</span>
            <strong>Three moments. Under two minutes.</strong>
            <p>Every scenario is deterministic, seeded, and resilient enough for a live hackathon demo.</p>
          </div>
        </div>
      </section>

      <section className="surface-strip">
        {[send, buy, reply].map((scenario) => (
          <a key={scenario.id} href={`/demo/${scenario.surface}?scenario=${scenario.id}`} className="surface-card">
            <div className="eyebrow">{SURFACE_META[scenario.surface].label}</div>
            <h2>{scenario.title}</h2>
            <p>{scenario.summary}</p>
            <span>Open {SURFACE_META[scenario.surface].label}</span>
          </a>
        ))}
      </section>

      <section className="thesis-grid">
        <article className="thesis-card">
          <div className="eyebrow">Why friction helps</div>
          <h2>The wrong delay feels annoying. The right delay prevents regret.</h2>
          <p>Stayhand only interrupts when rules see a meaningful chance of avoidable damage: emotional sends, pressured checkouts, and replies that mirror heat.</p>
        </article>
        <article className="thesis-card">
          <div className="eyebrow">Technical credibility</div>
          <h2>Not a mockup.</h2>
          <p>The demo runs on a real event runtime, persistent ledger, seeded adapters, explainability traces, and an ops surface judges can inspect on demand.</p>
          <a href="/ops" className="top-link subtle">
            View ops proof
          </a>
        </article>
      </section>
    </main>
  );
}
