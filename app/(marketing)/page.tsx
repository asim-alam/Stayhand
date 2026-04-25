import { SiteHeader } from "@/components/shared/site-header";
import { AnimatedCounter } from "@/components/shared/animated-counter";
import { DynamicHeroTitle } from "@/components/shared/dynamic-hero-title";
import { listScenarios, SURFACE_META } from "@/lib/scenarios/catalog";

const STATS = [
  { value: 5400, prefix: "$", label: "Impulse purchases per person/year" },
  { value: 95, suffix: " min", label: "Daily doomscrolling average" },
  { value: 2.5, suffix: " sec", decimals: 1, label: "Average time before regret" },
  { value: 340, prefix: "↑", suffix: "%", label: "Scam losses since 2020" },
];

const SURFACE_ICONS: Record<string, string> = {
  send: "✉️",
  buy: "🛒",
  reply: "💬",
};

const TICKER_ITEMS = [
  "$642 espresso machine, in cart",
  "the reply-all that ends with 'per my last email'",
  "delete account, are you sure?",
  "the tweet about your boss",
  "11:47pm — angry Slack to the whole team",
  "$28 burrito delivery again",
];

export default function MarketingPage() {
  const send = listScenarios("send")[0];
  const buy = listScenarios("buy")[0];
  const reply = listScenarios("reply")[0];

  return (
    <main className="marketing-page">
      <SiteHeader active="home" />

      {/* ── Hero ─────────────────────────── */}
      <section className="landing-hero">
        <div className="hero-copy">
          <h1>
            <DynamicHeroTitle />
          </h1>
          <p>
            For the last decade, every app has been designed to remove friction. Faster payments. Smoother interfaces.
            Instant everything. Then came the scams, the regret, the messages you can&apos;t unsend.
            Stayhand adds one intelligent pause — at the exact moment your brain is about to go on autopilot.
          </p>
          <div className="hero-actions">
            <a href="/send" className="button primary landing-begin-button">
              <span>Begin</span>
              <span aria-hidden>→</span>
            </a>
            <a href={`/demo/send?scenario=${send.id}`} className="button ghost landing-demo-button">
              Try the demo →
            </a>
          </div>
          <div className="surface-hero__meta" style={{ marginTop: 8 }}>
            <span className="surface-chip"><strong>live</strong> send · buy · reply</span>
            <span className="surface-chip"><strong>demo</strong> same flows, seeded inputs, deterministic proof</span>
          </div>
        </div>

        <div className="hero-proof">
          <div className="proof-card featured">
            <span className="eyebrow">Product thesis</span>
            <strong>Rules detect the risk. AI explains why.</strong>
            <p>Deterministic rules decide when to pause. AI personalizes the explanation, suggests a safer version, and helps you choose — without removing control.</p>
          </div>
          <div className="proof-card">
            <span className="eyebrow">Demo promise</span>
            <strong>Three moments. Under two minutes.</strong>
            <p>Every scenario is deterministic, seeded, and resilient. No brittle dependencies. Works with or without AI.</p>
          </div>
        </div>
      </section>

      <section className="regret-ticker" aria-label="Almost moments">
        <div className="regret-ticker__track">
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, index) => (
            <span className="regret-ticker__item" key={`${item}-${index}`}>
              <strong>Almost</strong>
              <span>{item}</span>
            </span>
          ))}
        </div>
      </section>

      {/* ── Stats ────────────────────────── */}
      <section className="stats-strip">
        {STATS.map((stat) => (
          <div key={stat.label} className="stat-card">
            <div className="stat-value">
              <AnimatedCounter
                value={stat.value}
                prefix={stat.prefix}
                suffix={stat.suffix}
                decimals={stat.decimals}
              />
            </div>
            <div className="stat-label">{stat.label}</div>
          </div>
        ))}
      </section>

      {/* ── Surface Cards ────────────────── */}
      <section className="surface-strip">
        {[send, buy, reply].map((scenario) => (
          <article key={scenario.id} className="surface-card">
            <div className="eyebrow">{SURFACE_ICONS[scenario.surface]} {SURFACE_META[scenario.surface].eyebrow}</div>
            <h2>{SURFACE_META[scenario.surface].label}</h2>
            <p>{SURFACE_META[scenario.surface].oneLiner}</p>
            <div className="row" style={{ marginTop: 4 }}>
                <a href={`/${scenario.surface}`} className="button primary">
                  Try {SURFACE_META[scenario.surface].label} →
              </a>
              <a href={`/demo/${scenario.surface}?scenario=${scenario.id}`} className="button ghost">
                View demo
              </a>
            </div>
          </article>
        ))}
      </section>

      {/* ── Thesis ───────────────────────── */}
      <section className="thesis-grid">
        <article className="thesis-card">
          <div className="eyebrow">Why friction helps</div>
          <h2>The wrong delay is annoying. The right delay prevents regret.</h2>
          <p>Stayhand only pauses when rules detect a meaningful chance of avoidable damage: emotional sends, pressured checkouts, and replies that mirror heat instead of resolving it.</p>
        </article>
        <article className="thesis-card">
          <div className="eyebrow">Technical credibility</div>
          <h2>Built for real decisions.</h2>
          <p>The demo runs on deterministic scenarios backed by real scoring logic, explainability traces, and persisted outcome history.</p>
          <a href="/results" className="top-link subtle" style={{ marginTop: 8 }}>
            View outcome ledger →
          </a>
        </article>
      </section>

      {/* ── Manifesto ────────────────────── */}
      <section className="manifesto-section">
        <div className="manifesto-quote">
          &ldquo;We built the fastest internet in history and filled it with regret.&rdquo;
        </div>
        <div className="manifesto-axiom">
          Friction isn&apos;t the enemy. Regret is.
        </div>
      </section>
    </main>
  );
}
