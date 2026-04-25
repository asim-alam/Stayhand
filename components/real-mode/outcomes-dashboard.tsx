"use client";

import { useEffect, useState } from "react";
import type { StayhandMoment } from "@/lib/real-mode/types";
import { AuthControl } from "@/components/shared/auth-control";

type FilterSurface = "all" | "reply" | "send" | "buy";

export function OutcomesDashboard() {
  const [moments, setMoments] = useState<StayhandMoment[]>([]);
  const [filter, setFilter] = useState<FilterSurface>("all");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const url = filter === "all" ? "/api/moments" : `/api/moments?surface=${filter}`;
    
    void fetch(url, { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load moments.");
        setMoments(data.moments || []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load moments."))
      .finally(() => setLoading(false));
  }, [filter]);

  if (loading && moments.length === 0) {
    return (
      <div className="marketing-page">
        <div style={{ padding: "100px", textAlign: "center", color: "var(--muted)" }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Stayhand</div>
          <h2>Loading your history...</h2>
        </div>
      </div>
    );
  }

  const hasMoments = moments.length > 0;

  // Calculate metrics for current view
  const total = moments.length;
  const improvedCount = moments.filter(m => 
    (m.heat_after !== null && m.heat_before !== null && m.heat_after < m.heat_before) ||
    m.user_action === "used_try" || 
    m.status === "cooled"
  ).length;
  
  const suggestionsUsed = moments.filter(m => m.user_action === "used_try" || m.user_action === "edited_try").length;
  
  return (
    <main className="marketing-page">
      <header className="site-header" style={{ position: "sticky", top: 0, zIndex: 100 }}>
        <div className="site-header__brand">
          <a href="/" className="site-header__brand-link">
            <img src="/logo.png" alt="" style={{ width: 24, height: 24, marginRight: 8, borderRadius: 4 }} />
            <span><span style={{ color: 'var(--amber)' }}>Stay</span>hand</span>
          </a>
        </div>
        
        <div style={{ flex: 1, display: "flex", flexDirection: "column", marginLeft: 32 }}>
          <strong style={{ fontSize: "0.95rem" }}>{filter === "all" ? "All" : filter.charAt(0).toUpperCase() + filter.slice(1)} Outcomes</strong>
          <span style={{ fontSize: "0.75rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>History of intentional friction</span>
        </div>

        <nav className="site-header__nav">
          <AuthControl />
          <a href="/reply" className="button ghost" style={{ fontSize: "0.8rem" }}>Back to app</a>
        </nav>
      </header>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "60px 24px" }}>
        <section style={{ marginBottom: 48 }}>
          <div className="eyebrow" style={{ marginBottom: 16 }}>✓ Coaching Dashboard</div>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "3rem", fontWeight: 400, letterSpacing: "-0.03em", marginBottom: 20 }}>
            The moments that mattered.
          </h1>
          
          {/* Surface Filters */}
          <div style={{ display: "flex", gap: 10, marginTop: 32 }}>
            {(["all", "reply", "send", "buy"] as FilterSurface[]).map(s => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`button ${filter === s ? "primary" : "ghost"}`}
                style={{ padding: "8px 16px", borderRadius: "999px", fontSize: "0.8rem" }}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </section>

        {error && (
          <div style={{ padding: "16px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: 12, marginBottom: 32, color: "#fca5a5" }}>
            <strong>Error loading outcomes:</strong> {error}
          </div>
        )}

        {hasMoments ? (
          <>
            <section className="stats-strip" style={{ marginBottom: 48, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 20 }}>
              <div className="stat-card" style={{ background: "rgba(255,255,255,0.03)", padding: "24px", borderRadius: "16px", border: "1px solid var(--border)" }}>
                <div className="stat-value" style={{ color: "var(--amber)", fontSize: "2rem", fontWeight: 700 }}>{total}</div>
                <div className="stat-label" style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted)", marginTop: 4 }}>Total Moments</div>
              </div>
              <div className="stat-card" style={{ background: "rgba(255,255,255,0.03)", padding: "24px", borderRadius: "16px", border: "1px solid var(--border)" }}>
                <div className="stat-value" style={{ color: "var(--sage)", fontSize: "2rem", fontWeight: 700 }}>{improvedCount}</div>
                <div className="stat-label" style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted)", marginTop: 4 }}>Improved Outcomes</div>
              </div>
              <div className="stat-card" style={{ background: "rgba(255,255,255,0.03)", padding: "24px", borderRadius: "16px", border: "1px solid var(--border)" }}>
                <div className="stat-value" style={{ color: "var(--indigo)", fontSize: "2rem", fontWeight: 700 }}>{suggestionsUsed}</div>
                <div className="stat-label" style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted)", marginTop: 4 }}>Suggestions Used</div>
              </div>
            </section>

            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {moments.map((moment, i) => (
                <article
                  key={moment.id}
                  className="thesis-card animate-in"
                  style={{ 
                    animationDelay: `${i * 50}ms`,
                    padding: "24px",
                    background: "rgba(20,20,22,0.6)",
                    borderRadius: "20px",
                    border: "1px solid var(--border)",
                    display: "grid",
                    gap: 20
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <span className="eyebrow" style={{ color: "var(--amber)", fontSize: "0.65rem" }}>{moment.surface} &middot; {moment.status}</span>
                      <h3 style={{ margin: "4px 0", fontSize: "1.25rem", fontFamily: "var(--font-serif)" }}>{moment.title}</h3>
                      <time style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{new Date(moment.created_at).toLocaleString()}</time>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {moment.trigger_reason && (
                        <span style={{ padding: "4px 10px", borderRadius: "999px", background: "rgba(232, 162, 74, 0.1)", border: "1px solid rgba(232, 162, 74, 0.2)", color: "var(--amber)", fontSize: "0.7rem", fontWeight: 600 }}>
                          {moment.trigger_reason}
                        </span>
                      )}
                      <span style={{ padding: "4px 10px", borderRadius: "999px", background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", color: "var(--muted)", fontSize: "0.7rem" }}>
                        {moment.user_action.replace(/_/g, " ")}
                      </span>
                    </div>
                  </div>

                  {moment.ai_review && (
                    <div style={{ padding: "16px", background: "rgba(70, 166, 119, 0.05)", borderRadius: "12px", borderLeft: "3px solid var(--sage)", fontSize: "0.9rem", lineHeight: 1.5 }}>
                      {moment.ai_review}
                    </div>
                  )}

                  <div style={{ display: "grid", gridTemplateColumns: moment.final_output ? "1fr 1fr" : "1fr", gap: 20 }}>
                    {moment.original_input && (
                      <div>
                        <span className="eyebrow" style={{ fontSize: "0.6rem", display: "block", marginBottom: 8, opacity: 0.6 }}>Initial Draft</span>
                        <div style={{ fontSize: "0.85rem", color: "var(--muted)", padding: "12px", background: "rgba(0,0,0,0.2)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.05)" }}>
                          {moment.original_input}
                        </div>
                      </div>
                    )}
                    {moment.final_output && (
                      <div>
                        <span className="eyebrow" style={{ fontSize: "0.6rem", display: "block", marginBottom: 8, opacity: 0.6 }}>Final Action</span>
                        <div style={{ fontSize: "0.85rem", color: "var(--foreground)", padding: "12px", background: "rgba(42, 157, 143, 0.05)", borderRadius: "8px", border: "1px solid rgba(42, 157, 143, 0.2)" }}>
                          {moment.final_output}
                        </div>
                      </div>
                    )}
                  </div>

                  {moment.ai_suggestion && moment.user_action !== "sent_original" && (
                    <div style={{ marginTop: 8 }}>
                      <span className="eyebrow" style={{ fontSize: "0.6rem", display: "block", marginBottom: 8, color: "var(--indigo)" }}>Stayhand Suggestion</span>
                      <div style={{ fontSize: "0.9rem", fontStyle: "italic", color: "var(--text)", padding: "12px", background: "rgba(63, 114, 175, 0.05)", borderRadius: "8px", border: "1px solid rgba(63, 114, 175, 0.1)" }}>
                        &ldquo;{moment.ai_suggestion}&rdquo;
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </>
        ) : (
          <section style={{ padding: "80px 40px", border: "1px dashed var(--border)", borderRadius: "24px", textAlign: "center" }}>
            <div className="eyebrow" style={{ marginBottom: 16 }}>Empty History</div>
            <h2 style={{ fontSize: "1.5rem", marginBottom: 12 }}>No moments found in {filter}.</h2>
            <p style={{ color: "var(--muted)", marginBottom: 32, maxWidth: 460, margin: "0 auto 32px" }}>
              Intentional friction hasn't been applied to this mode yet. Start using Stayhand to see your outcomes here.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <a href="/reply" className="button primary">Go to Reply Mode</a>
              <a href="/send" className="button ghost">Go to Send Mode</a>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
