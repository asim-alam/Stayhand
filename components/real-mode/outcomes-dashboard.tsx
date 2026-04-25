"use client";

import { useEffect, useState } from "react";
import type { MessageOutcome } from "@/lib/real-mode/types";

export function OutcomesDashboard() {
  const [outcomes, setOutcomes] = useState<MessageOutcome[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetch("/api/outcomes", { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load outcomes.");
        setOutcomes(data.outcomes || []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load outcomes."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="demo-shell"><div style={{ padding: "40px", textAlign: "center", color: "var(--muted)" }}>Loading outcomes...</div></div>;
  }

  const hasOutcomes = outcomes.length > 0;

  // Calculate metrics
  const totalCoached = outcomes.length;
  const suggestionsUsed = outcomes.filter(o => o.user_action === "used_try").length;
  const suggestionsEdited = outcomes.filter(o => o.user_action === "edited_try").length;
  const suggestionsDismissed = outcomes.filter(o => o.user_action === "dismissed" || o.user_action === "sent_original").length;
  
  const heatReducedCount = outcomes.filter(o => o.heat_after < o.heat_before).length;
  const apologiesImproved = outcomes.filter(o => o.reply_type.includes("apology")).length;
  
  const avgHeatBefore = totalCoached ? Math.round(outcomes.reduce((sum, o) => sum + o.heat_before, 0) / totalCoached) : 0;
  const avgHeatAfter = totalCoached ? Math.round(outcomes.reduce((sum, o) => sum + o.heat_after, 0) / totalCoached) : 0;

  return (
    <main className="marketing-page">
      <header className="site-header" style={{ position: "sticky", top: 0, zIndex: 100, borderBottom: "1px solid var(--border)", background: "rgba(10,10,10,0.8)", backdropFilter: "blur(12px)" }}>
        <div className="site-header__brand" style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <a href="/" className="site-header__brand-link" style={{ textDecoration: 'none' }}>
            <img src="/logo.png" alt="" style={{ width: 24, height: 24, marginRight: 8, borderRadius: 4, verticalAlign: 'middle', boxShadow: '0 0 24px rgba(240, 161, 58, 0.12)' }} />
            <span><span style={{ color: 'var(--amber)' }}>Stay</span>hand</span>
          </a>
          <span className="eyebrow" style={{ margin: 0, paddingLeft: 16, borderLeft: "1px solid var(--border)" }}>Reply Mode</span>
        </div>
        
        <div style={{ flex: 1, display: "flex", flexDirection: "column", marginLeft: 32 }}>
          <strong style={{ fontSize: "0.95rem" }}>Message Outcomes</strong>
          <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>A history of your coached moments</span>
        </div>

        <nav className="site-header__nav">
          <a href="/reply" className="button ghost" style={{ fontSize: "0.85rem" }}>← Back to conversations</a>
        </nav>
      </header>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "60px 24px" }}>
        <section style={{ marginBottom: 60 }}>
          <div className="eyebrow" style={{ color: "var(--amber)", marginBottom: 16 }}>✓ Coaching Results</div>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "2.5rem", fontWeight: 400, letterSpacing: "-0.02em", marginBottom: 16 }}>
            See what changed before you sent.
          </h1>
          <p style={{ fontSize: "1.1rem", color: "var(--muted)", maxWidth: 600, lineHeight: 1.6 }}>
            Every coached draft, Try suggestion, and final message appears here so you can see how Stayhand reduced friction.
          </p>
        </section>

        {error && <span style={{ display: "inline-block", color: "var(--coral)", background: "rgba(231,111,81,0.1)", padding: "4px 12px", borderRadius: 4, fontSize: "0.85rem", marginBottom: 24, border: "1px solid rgba(231,111,81,0.2)" }}>Error: {error}</span>}

      {hasOutcomes ? (
        <>
          <section className="stats-strip" style={{ marginBottom: 60 }}>
            <div className="stat-card">
              <div className="stat-value" style={{ color: "var(--amber)" }}>{totalCoached}</div>
              <div className="stat-label">Moments coached</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: "var(--sage)" }}>{heatReducedCount}</div>
              <div className="stat-label">Messages cooled down</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: "var(--indigo)" }}>{suggestionsUsed + suggestionsEdited}</div>
              <div className="stat-label">Suggestions used/edited</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: avgHeatAfter < avgHeatBefore ? "var(--sage)" : "var(--muted)" }}>{avgHeatBefore} → {avgHeatAfter}</div>
              <div className="stat-label">Avg heat reduction</div>
            </div>
          </section>

          <section className="insight-section" style={{ marginBottom: 40, padding: 24, borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
            <h3 style={{ fontSize: "1rem", marginBottom: 12, color: "var(--amber)" }}>What Stayhand noticed</h3>
            <ul style={{ paddingLeft: 20, color: "var(--muted)", margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {heatReducedCount > 0 && <li>You successfully cooled down {heatReducedCount} message{heatReducedCount > 1 ? "s" : ""} after coaching.</li>}
              {suggestionsDismissed > 0 && <li>You dismissed {suggestionsDismissed} suggestion{suggestionsDismissed > 1 ? "s" : ""}, but still received feedback on your drafts.</li>}
              {apologiesImproved > 0 && <li>The coach helped improve {apologiesImproved} apolog{apologiesImproved > 1 ? "ies" : "y"}.</li>}
              {totalCoached < 3 && <li>Complete more coached moments to see deeper patterns.</li>}
            </ul>
          </section>

          <div className="outcomes-timeline" style={{ marginBottom: 60 }}>
            <h3 style={{ fontSize: "1.1rem", marginBottom: 24, fontFamily: "var(--font-serif)", fontWeight: 400 }}>Friction Timeline</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 16, borderLeft: "1px solid var(--border)", paddingLeft: 24, marginLeft: 8 }}>
              {outcomes.map(item => (
                <div key={`timeline-${item.id}`} style={{ fontSize: "0.95rem", color: "var(--muted)", position: "relative" }}>
                  <div style={{ position: "absolute", left: "-28.5px", top: "6px", width: "8px", height: "8px", borderRadius: "50%", background: "var(--amber)", boxShadow: "0 0 10px var(--amber)" }} />
                  <strong style={{ color: "var(--foreground)" }}>{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong> &middot; {item.other_person_name} &middot; {item.issue_type === "none" ? "Routine check" : item.issue_type.replace(/_/g, " ")} &middot; {item.user_action.replace(/_/g, " ")}
                </div>
              ))}
            </div>
          </div>

          <div className="results-list" style={{ display: "flex", flexDirection: "column", gap: 32 }}>
            <h3 style={{ fontSize: "1.3rem", fontFamily: "var(--font-serif)", fontWeight: 400 }}>Recent Outcomes</h3>
            {outcomes.map((item, i) => (
              <article
                key={item.id}
                className="thesis-card animate-in"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="row spread" style={{ marginBottom: 24 }}>
                  <div>
                    <span className="eyebrow" style={{ display: "block", marginBottom: 4 }}>Conversation: {item.other_person_name}</span>
                    <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                      {new Date(item.timestamp).toLocaleString()} &middot; Heat: <strong style={{ color: item.heat_before > 60 ? "var(--coral)" : "inherit" }}>{item.heat_before}</strong>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {item.warning_badge && <span className="status-pill" style={{ background: "rgba(231, 111, 81, 0.1)", color: "var(--coral)", fontSize: "0.75rem", border: "1px solid rgba(231, 111, 81, 0.2)" }}>{item.warning_badge}</span>}
                    <span className="status-pill" style={{ fontSize: "0.75rem", background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)" }}>{item.reply_type.replace(/_/g, " ")}</span>
                  </div>
                </div>

                <div className="stack" style={{ gap: 24 }}>
                  <div className="note" style={{ background: "rgba(240, 161, 58, 0.05)", padding: 20, borderRadius: 12, borderLeft: "2px solid var(--amber)" }}>
                    <strong style={{ display: "block", marginBottom: 8, color: "var(--amber)", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>AI Review</strong>
                    <span style={{ fontSize: "1.05rem", lineHeight: 1.5 }}>{item.ai_review}</span>
                  </div>

                  <div className="diff-view" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                    <div>
                      <strong style={{ display: "block", marginBottom: 12, fontSize: "0.85rem", color: "var(--muted)" }}>Original draft</strong>
                      <div style={{ padding: 20, background: "rgba(255,255,255,0.02)", borderRadius: 12, fontSize: "1rem", color: "var(--muted)", textDecoration: "line-through", border: "1px solid var(--border)" }}>
                        {item.user_draft}
                      </div>
                    </div>
                    <div>
                      <strong style={{ display: "block", marginBottom: 12, fontSize: "0.85rem", color: "var(--sage)" }}>Final sent message</strong>
                      <div style={{ padding: 20, background: "rgba(42, 157, 143, 0.05)", borderRadius: 12, fontSize: "1rem", border: "1px solid rgba(42, 157, 143, 0.2)" }}>
                        {item.final_sent_message}
                      </div>
                    </div>
                  </div>

                  {item.try_message && (
                    <div>
                      <strong style={{ display: "block", marginBottom: 12, fontSize: "0.85rem", color: "var(--indigo)" }}>AI Suggestion</strong>
                      <div style={{ padding: 20, background: "rgba(63, 114, 175, 0.05)", borderRadius: 12, fontSize: "1rem", border: "1px solid rgba(63, 114, 175, 0.2)", fontStyle: "italic" }}>
                        {item.try_message}
                      </div>
                    </div>
                  )}

                  <div style={{ borderTop: "1px solid var(--border)", paddingTop: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "0.9rem", color: "var(--muted)" }}>Outcome: <strong style={{ color: "var(--foreground)" }}>{item.user_action.replace(/_/g, " ")}</strong></span>
                    <div className="row" style={{ gap: 16 }}>
                      <a href={`/reply?conversation=${item.conversation_id}`} className="top-link subtle" style={{ fontSize: "0.85rem" }}>View conversation →</a>
                      <button className="top-link subtle" style={{ fontSize: "0.85rem", background: "none", border: "none", cursor: "pointer" }} onClick={() => navigator.clipboard.writeText(item.final_sent_message)}>Copy final message</button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : (
        <section className="thesis-card animate-in" style={{ padding: "40px", border: "1px dashed var(--border)", background: "transparent", textAlign: "left" }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>empty state</div>
          <h2 style={{ fontSize: "1.5rem", marginBottom: 12 }}>No coached moments yet.</h2>
          <p style={{ color: "var(--muted)", marginBottom: 24, maxWidth: 500 }}>
            When Stayhand reviews a draft, suggests a Try line, or helps cool down a message, the outcome will appear here.
          </p>
          <div className="row" style={{ gap: 16 }}>
            <a href="/reply" className="button primary">Start a conversation</a>
            <a href="/demo/reply" className="button ghost">Run demo scenario</a>
          </div>
        </section>
      )}
      </div>
    </main>
  );
}
