"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [callbackUrl, setCallbackUrl] = useState("/results");

  const [displayName, setDisplayName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [authMode, setAuthMode] = useState<"create" | "sign-in">("sign-in");
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("callbackUrl") || "/results";
    setCallbackUrl(requested);

    void fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { user?: { id: string } | null }) => {
        if (data.user) {
          router.replace(requested as any);
        }
      })
      .catch(() => {
        // no-op: user stays on login form
      });
  }, [router]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, passcode, mode: authMode }),
      });
      
      const data = await response.json();
      
      if (!response.ok || !data.user) {
        setAuthError(data.error ?? "Sign in failed");
        setLoading(false);
        return;
      }
      
      router.push(callbackUrl as any);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Sign in failed");
      setLoading(false);
    }
  }

  return (
    <main className="reply-app-shell reply-app-shell--center" style={{ minHeight: '100vh' }}>
      <form className="reply-signin" onSubmit={signIn}>
        <a href="/" className="site-header__brand-link" style={{ textDecoration: 'none', marginBottom: 12 }}>
          <img src="/logo.png" alt="" style={{ width: 42, height: 42, marginRight: 12, borderRadius: 6, verticalAlign: 'middle', boxShadow: '0 0 42px rgba(240, 161, 58, 0.1)' }} />
          <span style={{ fontSize: '1.4rem' }}><span style={{ color: 'var(--amber)' }}>Stay</span>hand</span>
        </a>
        <span className="eyebrow">local account</span>
        <h1>{authMode === "create" ? "Create your account." : "Sign in."}</h1>
        <p>
          Pick a display name and passcode. Stayhand will securely log your moments and resume your conversations from this browser.
        </p>
        <div className="reply-auth-toggle">
          <button type="button" className={authMode === "sign-in" ? "is-active" : ""} onClick={() => setAuthMode("sign-in")}>
            Sign in
          </button>
          <button type="button" className={authMode === "create" ? "is-active" : ""} onClick={() => setAuthMode("create")}>
            Create account
          </button>
        </div>
        <label>
          Display name
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Ari" disabled={loading} />
        </label>
        <label>
          Passcode
          <input
            type="password"
            value={passcode}
            onChange={(event) => setPasscode(event.target.value)}
            placeholder="something memorable"
            disabled={loading}
          />
        </label>
        {authError && <p className="reply-error">{authError}</p>}
        <button type="submit" className="button primary" disabled={loading || !displayName.trim() || !passcode.trim()}>
          {loading ? "Working..." : authMode === "create" ? "Create account" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
