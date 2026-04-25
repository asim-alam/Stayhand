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
    <div className="demo-shell">
      <div className="product-topbar">
        <div className="row" style={{ gap: 16 }}>
          <a href="/" className="top-link site-header__brand-link" style={{ textDecoration: 'none' }}>
            <img src="/logo.png" alt="" style={{ width: 22, height: 22, marginRight: 8, borderRadius: 4, verticalAlign: 'middle', boxShadow: '0 0 20px rgba(240, 161, 58, 0.1)' }} />
            <span><span style={{ color: 'var(--amber)' }}>Stay</span>hand</span>
          </a>
          <a href="/reply" className="top-link subtle">← Back to conversations</a>
        </div>
        <span className="top-link subtle">Message Outcomes</span>
      </div>

      <section className="moment-hero">
        <div className="eyebrow" style={{ color: "var(--sage)" }}>✓ Coaching Results</div>
        <h1>See what changed before you sent.</h1>
        <p>Every coached draft, Try suggestion, and final message appears here so you can see how Stayhand reduced friction.</p>
      </section>

      {error && <div className="banner error">{error}</div>}

      {hasOutcomes ? (
        <>
          <section className="results-metrics" style={{ marginBottom: 40, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
            <StatCard label="Moments coached" value={String(totalCoached)} color="var(--amber)" />
            <StatCard label="Messages cooled down" value={String(heatReducedCount)} color="var(--sage)" />
            <StatCard label="Suggestions used/edited" value={String(suggestionsUsed + suggestionsEdited)} color="var(--indigo)" />
            <StatCard label="Avg heat (before → after)" value={`${avgHeatBefore} → ${avgHeatAfter}`} color={avgHeatAfter < avgHeatBefore ? "var(--sage)" : "var(--muted)"} />
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

          <div className="outcomes-timeline" style={{ marginBottom: 40 }}>
            <h3 style={{ fontSize: "1.1rem", marginBottom: 20 }}>Friction Timeline</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, borderLeft: "2px solid rgba(255,255,255,0.1)", paddingLeft: 16 }}>
              {outcomes.map(item => (
                <div key={`timeline-${item.id}`} style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
                  <strong style={{ color: "var(--foreground)" }}>{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong> &middot; {item.other_person_name} &middot; {item.issue_type === "none" ? "Routine check" : item.issue_type.replace(/_/g, " ")} &middot; {item.user_action.replace(/_/g, " ")}
                </div>
              ))}
            </div>
          </div>

          <div className="results-list" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <h3 style={{ fontSize: "1.1rem" }}>Recent Outcomes</h3>
            {outcomes.map((item, i) => (
              <article
                key={item.id}
                className="result-card animate-in"
                style={{ animationDelay: `${i * 100}ms`, background: "var(--panel)", padding: 24, borderRadius: 12, border: "1px solid var(--border)" }}
              >
                <div className="row spread" style={{ marginBottom: 16 }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: "1.1rem" }}>Conversation: {item.other_person_name}</span>
                    <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 4 }}>
                      {new Date(item.timestamp).toLocaleString()} &middot; Heat: <span style={{ color: item.heat_before > 60 ? "var(--coral)" : "inherit" }}>{item.heat_before}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {item.warning_badge && <span className="status-pill" style={{ background: "rgba(231, 111, 81, 0.1)", color: "var(--coral)", fontSize: "0.75rem", border: "1px solid rgba(231, 111, 81, 0.2)" }}>{item.warning_badge}</span>}
                    <span className="status-pill" style={{ fontSize: "0.75rem", background: "rgba(255,255,255,0.05)" }}>{item.reply_type}</span>
                  </div>
                </div>

                <div className="stack" style={{ gap: 24 }}>
                  <div className="note" style={{ background: "rgba(240, 161, 58, 0.05)", padding: 16, borderRadius: 8, borderLeft: "3px solid var(--amber)" }}>
                    <strong style={{ display: "block", marginBottom: 8, color: "var(--amber)", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>AI Review</strong>
                    <span style={{ fontSize: "0.95rem" }}>{item.ai_review}</span>
                  </div>

                  <div className="diff-view" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <div>
                      <strong style={{ display: "block", marginBottom: 8, fontSize: "0.85rem", color: "var(--muted)" }}>Original draft</strong>
                      <div style={{ padding: 16, background: "rgba(255,255,255,0.02)", borderRadius: 8, fontSize: "0.95rem", color: "var(--muted)", textDecoration: "line-through" }}>
                        {item.user_draft}
                      </div>
                    </div>
                    <div>
                      <strong style={{ display: "block", marginBottom: 8, fontSize: "0.85rem", color: "var(--sage)" }}>Final sent message</strong>
                      <div style={{ padding: 16, background: "rgba(42, 157, 143, 0.05)", borderRadius: 8, fontSize: "0.95rem", border: "1px solid rgba(42, 157, 143, 0.2)" }}>
                        {item.final_sent_message}
                      </div>
                    </div>
                  </div>

                  {item.try_message && (
                    <div>
                      <strong style={{ display: "block", marginBottom: 8, fontSize: "0.85rem", color: "var(--indigo)" }}>AI Suggestion</strong>
                      <div style={{ padding: 16, background: "rgba(63, 114, 175, 0.05)", borderRadius: 8, fontSize: "0.95rem", border: "1px solid rgba(63, 114, 175, 0.2)", fontStyle: "italic" }}>
                        {item.try_message}
                      </div>
                    </div>
                  )}

                  <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Outcome: <strong>{item.user_action.replace(/_/g, " ")}</strong></span>
                    <div className="row" style={{ gap: 12 }}>
                      <a href={`/reply?conversation=${item.conversation_id}`} className="top-link subtle" style={{ fontSize: "0.85rem" }}>View conversation</a>
                      <button className="top-link subtle" style={{ fontSize: "0.85rem", background: "none", border: "none", cursor: "pointer" }} onClick={() => navigator.clipboard.writeText(item.final_sent_message)}>Copy final message</button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : (
        <section className="story-card empty-state animate-in" style={{ textAlign: "center", padding: "60px 20px" }}>
          <h2 style={{ marginBottom: 12 }}>No coached moments yet</h2>
          <p style={{ color: "var(--muted)", marginBottom: 32, maxWidth: 500, margin: "0 auto 32px" }}>
            When Stayhand reviews a draft, suggests a Try line, or helps cool down a message, the outcome will appear here.
          </p>
          <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
            <a href="/reply" className="button primary">Start a conversation</a>
            <a href="/demo/reply" className="button secondary">Run demo scenario</a>
          </div>
        </section>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="metric-card" style={{ borderTop: `3px solid ${color}`, background: "rgba(255,255,255,0.02)", padding: 20, borderRadius: "0 0 8px 8px" }}>
      <span style={{ display: "block", fontSize: "0.85rem", color: "var(--muted)", marginBottom: 8 }}>{label}</span>
      <strong style={{ color, fontSize: "1.5rem", fontWeight: 600 }}>{value}</strong>
    </div>
  );
}
