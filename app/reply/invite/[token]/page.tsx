"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";

type ReplyUser = {
  id: string;
  displayName: string;
};

export default function ReplyInvitePage() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState<ReplyUser | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [status, setStatus] = useState("Checking invite...");
  const [conversationId, setConversationId] = useState("");

  useEffect(() => {
    const parts = window.location.pathname.split("/");
    const nextToken = parts[parts.length - 1] || "";
    setToken(nextToken);
    void loadUser(nextToken);
  }, []);

  async function loadUser(nextToken: string) {
    const response = await fetch("/api/auth/me");
    const data = (await response.json()) as { user: ReplyUser | null };
    setUser(data.user);
    if (data.user) {
      await accept(nextToken);
    } else {
      setStatus("Sign in to accept this one-to-one conversation.");
    }
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Signing in...");
    const response = await fetch("/api/auth/sign-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName, passcode }),
    });
    const data = (await response.json()) as { user?: ReplyUser; error?: string };
    if (!response.ok || !data.user) {
      setStatus(data.error ?? "Sign in failed.");
      return;
    }
    setUser(data.user);
    await accept(token);
  }

  async function accept(nextToken: string) {
    setStatus("Accepting invite...");
    const response = await fetch("/api/reply/invites/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: nextToken }),
    });
    const data = (await response.json()) as { conversation?: { id: string }; error?: string };
    if (!response.ok || !data.conversation) {
      setStatus(data.error ?? "Invite could not be accepted.");
      return;
    }
    setConversationId(data.conversation.id);
    setStatus("Invite accepted.");
  }

  return (
    <main className="reply-app-shell reply-app-shell--center">
      <section className="reply-signin">
        <a href="/" className="site-header__brand-link" style={{ textDecoration: 'none', marginBottom: 12 }}>
          <img src="/logo.png" alt="" style={{ width: 42, height: 42, marginRight: 12, borderRadius: 6, verticalAlign: 'middle', boxShadow: '0 0 42px rgba(240, 161, 58, 0.1)' }} />
          <span style={{ fontSize: '1.4rem' }}><span style={{ color: 'var(--amber)' }}>Stay</span>hand</span>
        </a>
        <span className="eyebrow">reply invite</span>
        <h1>Join the private thread.</h1>
        <p>{status}</p>

        {!user && (
          <form className="reply-invite-form" onSubmit={signIn}>
            <label>
              Display name
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your name" />
            </label>
            <label>
              Passcode
              <input
                type="password"
                value={passcode}
                onChange={(event) => setPasscode(event.target.value)}
                placeholder="local passcode"
              />
            </label>
            <button type="submit" className="button primary">
              Sign in and accept
            </button>
          </form>
        )}

        {conversationId && (
          <a className="button primary" href={`/reply?conversation=${conversationId}`}>
            Open conversation
          </a>
        )}
      </section>
    </main>
  );
}
