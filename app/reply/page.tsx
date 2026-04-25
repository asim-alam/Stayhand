"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { CoolingDrawer, type CoolingItem } from "@/components/real-mode/cooling-drawer";
import { HeatMeter } from "@/components/real-mode/heat-meter";
import { HoldSendButton } from "@/components/real-mode/hold-send-button";
import { ReadAloudGate } from "@/components/real-mode/read-aloud-gate";
import { SoftenSheet } from "@/components/real-mode/soften-sheet";
import type { ReplyAnalyzeResult, ReplyCategory, ReplyCoachMessage, BotPersona } from "@/lib/real-mode/types";

// ---------------------------------------------------------------------------
// Bot personas (mirrors server-side REPLY_BOTS — safe to duplicate, just metadata)
// ---------------------------------------------------------------------------
const REPLY_BOT_PERSONAS: Record<string, BotPersona> = {
  "bot-alex": {
    name: "Alex",
    role: "conflict repair partner",
    personality: "sensitive but fair; names the emotional impact and responds better to accountability than defensiveness",
  },
  "bot-maya": {
    name: "Maya",
    role: "deadline-focused coworker",
    personality: "direct, practical, low patience for vague replies; wants ownership and a specific next step",
  },
  "bot-priya": {
    name: "Priya",
    role: "calm mediator",
    personality: "measured, curious, and clarifying; helps turn tension into a concrete shared decision",
  },
};


type ReplyUser = {
  id: string;
  displayName: string;
};

type ReplyConversation = {
  id: string;
  kind: "bot" | "human";
  title: string;
  botId: string | null;
  updatedAt: string;
  lastMessageAt: string | null;
  participants: Array<{ id: string; type: "user" | "bot"; displayName: string }>;
  lastMessage: ReplyMessage | null;
  memory: string;
};

type ReplyMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  senderType: "user" | "bot";
  senderName: string;
  body: string;
  friction: SendMeta;
  createdAt: string;
};

type SendMeta = {
  cooled?: boolean;
  softened?: boolean;
  apology?: boolean;
  sentAnyway?: boolean;
  heat?: number;
  category?: ReplyCategory | string;
};

type PendingSend = {
  text: string;
  meta: SendMeta;
};

type ReviewState = {
  original: string;
  suggestion: string;
  analysis: ReplyAnalyzeResult;
  meta: SendMeta;
};

type SocketEvent =
  | { type: "message.created"; conversationId: string; messages: ReplyMessage[]; conversation: ReplyConversation }
  | { type: "conversation.updated"; conversation: ReplyConversation }
  | { type: "invite.accepted"; conversation: ReplyConversation };

const EMPTY_ANALYSIS: ReplyAnalyzeResult = {
  reply_type: "other",
  verdict: "good",
  heat_label: "calm",
  issue_type: "none",
  ai_review: "",
  warning_badge: null,
  try_message: "",
  heat: 0,
  category: "neutral",
  softened: "",
  guidance: "",
  risk_factors: [],
  recommended_cooldown_seconds: 0,
  heat_trajectory: "stable",
  bot_context_hint: "",
  other_party_state: undefined,
};


function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function mergeConversations(list: ReplyConversation[], next: ReplyConversation): ReplyConversation[] {
  const merged = [next, ...list.filter((conversation) => conversation.id !== next.id)];
  return merged.sort((a, b) => {
    const aTime = a.lastMessageAt || a.updatedAt;
    const bTime = b.lastMessageAt || b.updatedAt;
    return bTime.localeCompare(aTime);
  });
}

function mergeMessages(list: ReplyMessage[], next: ReplyMessage[]): ReplyMessage[] {
  const map = new Map<string, ReplyMessage>();
  [...list, ...next].forEach((message) => map.set(message.id, message));
  return Array.from(map.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function getInitialConversationId(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("conversation");
}

function displayConversationTitle(conversation: ReplyConversation | null, user: ReplyUser | null): string {
  if (!conversation) return "Choose a conversation";
  if (conversation.kind === "bot") return conversation.title;
  const receiver = conversation.participants.find((participant) => participant.type === "user" && participant.id !== user?.id);
  return receiver?.displayName ?? conversation.title;
}

function toCoachMessage(message: ReplyMessage, user: ReplyUser | null): ReplyCoachMessage {
  return {
    speaker_type: message.senderId === user?.id ? "user" : "other_person",
    speaker_name: message.senderName,
    message: message.body,
    timestamp: message.createdAt,
    heat: typeof message.friction?.heat === "number" ? message.friction.heat : undefined,
  };
}

function buildCoachPayload(messages: ReplyMessage[], user: ReplyUser | null, draft: string) {
  const conversationContext = messages.slice(-10).map((message) => toCoachMessage(message, user));
  const latestIncoming = [...messages].reverse().find((message) => message.senderId !== user?.id);

  return {
    conversation_context: conversationContext,
    latest_incoming_message: latestIncoming ? toCoachMessage(latestIncoming, user) : null,
    user_draft: {
      speaker_type: "user" as const,
      speaker_name: user?.displayName || "You",
      message: draft.trim(),
      timestamp: new Date().toISOString(),
    },
  };
}

export default function ReplyPage() {
  const [user, setUser] = useState<ReplyUser | null>(null);
  const [session, setSession] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [authMode, setAuthMode] = useState<"create" | "sign-in">("sign-in");
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(false);

  const [conversations, setConversations] = useState<ReplyConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeConversation, setActiveConversation] = useState<ReplyConversation | null>(null);
  const [messages, setMessages] = useState<ReplyMessage[]>([]);
  const [memory, setMemory] = useState("No memory yet.");
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteStatus, setInviteStatus] = useState("");

  const [draft, setDraft] = useState("");
  const [analysis, setAnalysis] = useState<ReplyAnalyzeResult>(EMPTY_ANALYSIS);
  const [analyzing, setAnalyzing] = useState(false);
  const [showSoften, setShowSoften] = useState(false);
  const [cooling, setCooling] = useState<CoolingItem[]>([]);
  const [pendingReadAloud, setPendingReadAloud] = useState<PendingSend | null>(null);
  const [review, setReview] = useState<ReviewState | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [sending, setSending] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const activeIdRef = useRef<string | null>(null);

  const stats = messages.reduce(
    (acc, message) => {
      if (message.senderId === user?.id) {
        if (message.friction?.cooled) acc.cooled++;
        if (message.friction?.softened) acc.softened++;
        if (message.friction?.apology) acc.apologies++;
      }
      return acc;
    },
    { cooled: 0, softened: 0, apologies: 0 }
  );

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, activeId]);

  useEffect(() => {
    if (!session) return;
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${window.location.host}/ws/reply?session=${encodeURIComponent(session)}`);

    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data) as SocketEvent;
      if (payload.type === "message.created") {
        setConversations((prev) => mergeConversations(prev, payload.conversation));
        if (payload.conversationId === activeIdRef.current) {
          setMessages((prev) => mergeMessages(prev, payload.messages));
          setActiveConversation(payload.conversation);
          setMemory(payload.conversation.memory);
        }
      }
      if (payload.type === "invite.accepted" || payload.type === "conversation.updated") {
        setConversations((prev) => mergeConversations(prev, payload.conversation));
      }
    };

    return () => socket.close();
  }, [session]);

  useEffect(() => {
    if (!draft.trim()) {
      setAnalysis(EMPTY_ANALYSIS);
      setShowSoften(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setAnalyzing(true);
      try {
        // Resolve bot persona or other-party name
        const conversationKind = activeConversation?.kind ?? "bot";
        const botPersona = conversationKind === "bot" && activeConversation?.botId
          ? REPLY_BOT_PERSONAS[activeConversation.botId] ?? undefined
          : undefined;
        const otherPartyName = conversationKind === "human"
          ? activeConversation?.participants.find((p) => p.type === "user" && p.id !== user?.id)?.displayName
          : undefined;

        const response = await fetch("/api/reply/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            draft: draft.trim(),
            ...buildCoachPayload(messages, user, draft),
            context: `conversation: ${activeConversation?.title || "reply workspace"}`,
            botPersona,
            conversationKind,
            otherPartyName,
            userName: user?.displayName,
          }),
        });
        const data = (await response.json()) as { result?: ReplyAnalyzeResult };
        if (cancelled) return;
        const next = data.result ?? EMPTY_ANALYSIS;
        setAnalysis(next);
        setShowSoften(false);
      } catch {
        if (!cancelled) {
          setAnalysis(EMPTY_ANALYSIS);
          setShowSoften(false);
        }
      } finally {
        if (!cancelled) setAnalyzing(false);
      }
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeConversation, draft, messages, user]);


  useEffect(() => {
    if (!cooling.length) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      const ready = cooling.filter((item) => item.sendsAt <= now);
      if (ready.length) {
        ready.forEach((item) => {
          void deliverMessage(item.text, { cooled: true });
        });
        setCooling((prev) => prev.filter((item) => item.sendsAt > now));
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [cooling]);

  async function bootstrap() {
    setLoading(true);
    try {
      const response = await fetch("/api/auth/me");
      const data = (await response.json()) as { user: ReplyUser | null; session: string | null };
      setUser(data.user);
      setSession(data.session);
      if (data.user) {
        await loadConversations(getInitialConversationId());
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadConversations(preferredId?: string | null) {
    const response = await fetch("/api/reply/conversations");
    const data = (await response.json()) as { conversations?: ReplyConversation[] };
    const next = data.conversations ?? [];
    setConversations(next);
    const selected = next.find((conversation) => conversation.id === preferredId)?.id ?? next[0]?.id ?? null;
    setActiveId(selected);
    if (selected) await loadMessages(selected);
  }

  async function loadMessages(conversationId: string) {
    const response = await fetch(`/api/reply/messages?conversationId=${encodeURIComponent(conversationId)}`);
    const data = (await response.json()) as {
      messages?: ReplyMessage[];
      memory?: string;
      conversation?: ReplyConversation;
    };
    setMessages(data.messages ?? []);
    setMemory(data.memory ?? "No memory yet.");
    setActiveConversation(data.conversation ?? null);
    setActiveId(conversationId);
    window.history.replaceState(null, "", `/reply?conversation=${conversationId}`);
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    const response = await fetch("/api/auth/sign-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName, passcode, mode: authMode }),
    });
    const data = (await response.json()) as { user?: ReplyUser; session?: string; error?: string };
    if (!response.ok || !data.user || !data.session) {
      setAuthError(data.error ?? "sign in failed");
      return;
    }
    setUser(data.user);
    setSession(data.session);
    setDisplayName("");
    setPasscode("");
    await loadConversations(getInitialConversationId());
  }

  async function signOut() {
    await fetch("/api/auth/sign-out", { method: "POST" });
    setUser(null);
    setSession(null);
    setConversations([]);
    setMessages([]);
    setActiveConversation(null);
    setActiveId(null);
    setInviteUrl("");
    window.history.replaceState(null, "", "/reply");
  }

  async function createInviteLink() {
    setInviteStatus("creating...");
    const response = await fetch("/api/reply/invites", { method: "POST" });
    const data = (await response.json()) as { url?: string; error?: string };
    if (!response.ok || !data.url) {
      setInviteStatus(data.error ?? "failed to create invite");
      return;
    }
    setInviteUrl(data.url);
    setInviteStatus("invite ready");
    try {
      await navigator.clipboard.writeText(data.url);
      setInviteStatus("copied to clipboard");
    } catch {
      setInviteStatus("copy the link below");
    }
  }

  function resetComposer() {
    setDraft("");
    setAnalysis(EMPTY_ANALYSIS);
    setShowSoften(false);
    setReview(null);
    inputRef.current?.focus();
  }

  function maybeRequireReadAloud(payload: PendingSend): boolean {
    if (wordCount(payload.text) < 60) return false;
    setPendingReadAloud(payload);
    return true;
  }

  async function deliverMessage(body: string, meta: SendMeta) {
    if (!activeId || !body.trim()) return;
    setSending(true);
    try {
      const response = await fetch("/api/reply/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeId, body, friction: meta }),
      });
      const data = (await response.json()) as {
        created?: ReplyMessage[];
        conversation?: ReplyConversation;
        error?: string;
      };
      if (!response.ok || !data.created || !data.conversation) {
        throw new Error(data.error ?? "failed to send message");
      }
      setMessages((prev) => mergeMessages(prev, data.created!));
      setConversations((prev) => mergeConversations(prev, data.conversation!));
      setActiveConversation(data.conversation);
      setMemory(data.conversation.memory);
    } finally {
      setSending(false);
    }
  }

  function sendNow(text: string, meta: SendMeta) {
    if (maybeRequireReadAloud({ text, meta })) return;
    void deliverMessage(text, meta);
    resetComposer();
  }

  async function reviewDraft(meta: SendMeta = {}) {
    const text = draft.trim();
    if (!text) return;
    setReviewing(true);
    setReview(null);
    try {
      const conversationKind = activeConversation?.kind ?? "bot";
      const botPersona = conversationKind === "bot" && activeConversation?.botId
        ? REPLY_BOT_PERSONAS[activeConversation.botId] ?? undefined
        : undefined;
      const otherPartyName = conversationKind === "human"
        ? activeConversation?.participants.find((p) => p.type === "user" && p.id !== user?.id)?.displayName
        : undefined;

      const response = await fetch("/api/reply/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft: text,
          ...buildCoachPayload(messages, user, text),
          context: `conversation: ${displayConversationTitle(activeConversation, user)}`,
          botPersona,
          conversationKind,
          otherPartyName,
          userName: user?.displayName,
        }),
      });
      const data = (await response.json()) as { result?: ReplyAnalyzeResult };
      const next = data.result ?? analysis;
      const suggestion = next.try_message.trim() || next.softened.trim() || text;
      setAnalysis(next);
      setReview({
        original: text,
        suggestion,
        analysis: next,
        meta: { ...meta, heat: next.heat, category: meta.category ?? next.category },
      });
    } finally {
      setReviewing(false);
    }
  }


  function handleSend() {
    const text = draft.trim();
    if (!text) return;
    if (review) {
      sendReviewedDraft();
      return;
    }
    void reviewDraft({ heat: analysis.heat, category: analysis.category });
  }

  function handleApology() {
    const text = draft.trim();
    if (!text) return;
    void reviewDraft({ apology: true, heat: analysis.heat, category: "apology" });
  }

  function handleWantsCool() {
    const text = draft.trim();
    if (!text) return;
    const delay = Math.max(analysis.recommended_cooldown_seconds || 30, 15);
    setCooling((prev) => [...prev, { id: crypto.randomUUID(), text, sendsAt: Date.now() + delay * 1000 }]);
    resetComposer();
  }

  function sendOriginal() {
    const text = review?.original ?? draft.trim();
    if (!text) return;
    sendNow(text, { ...(review?.meta ?? {}), sentAnyway: true, heat: review?.analysis.heat ?? analysis.heat, category: review?.analysis.category ?? analysis.category });
  }

  function sendSoftened() {
    const text = review?.suggestion.trim() || analysis.softened.trim();
    if (!text) return;
    sendNow(text, { ...(review?.meta ?? {}), softened: true, heat: review?.analysis.heat ?? analysis.heat, category: review?.analysis.category ?? analysis.category });
  }

  function sendReviewedDraft() {
    if (!review) return;
    const text = draft.trim();
    if (!text) return;
    sendNow(text, {
      ...review.meta,
      softened: text !== review.original,
      heat: review.analysis.heat,
      category: review.analysis.category,
    });
  }

  function applySuggestion() {
    if (!review) return;
    setDraft(review.suggestion);
  }

  function confirmReadAloud() {
    if (!pendingReadAloud) return;
    void deliverMessage(pendingReadAloud.text, pendingReadAloud.meta);
    setPendingReadAloud(null);
    resetComposer();
  }

  function cancelReadAloud() {
    setPendingReadAloud(null);
  }

  function cancelCooling(id: string) {
    setCooling((prev) => prev.filter((item) => item.id !== id));
  }

  function editCooling(id: string, nextText: string) {
    setCooling((prev) =>
      prev.map((item) => (item.id === id ? { ...item, text: nextText, sendsAt: Date.now() + 15000 } : item))
    );
  }

  function sendCoolingNow(id: string) {
    const item = cooling.find((candidate) => candidate.id === id);
    if (!item) return;
    setCooling((prev) => prev.filter((candidate) => candidate.id !== id));
    void deliverMessage(item.text, { cooled: true, sentAnyway: true });
  }

  if (loading) {
    return <main className="reply-app-shell" />;
  }

  if (!user) {
    return (
      <main className="reply-app-shell reply-app-shell--center">
        <form className="reply-signin" onSubmit={signIn}>
          <a href="/" className="site-header__brand-link" style={{ textDecoration: 'none', marginBottom: 12 }}>
            <img src="/logo.png" alt="" style={{ width: 42, height: 42, marginRight: 12, borderRadius: 6, verticalAlign: 'middle', boxShadow: '0 0 42px rgba(240, 161, 58, 0.1)' }} />
            <span style={{ fontSize: '1.4rem' }}><span style={{ color: 'var(--amber)' }}>Stay</span>hand</span>
          </a>
          <span className="eyebrow">local account</span>
          <h1>{authMode === "create" ? "Create your reply account." : "Sign in to reply."}</h1>
          <p>
            Pick a display name and passcode. Stayhand will resume your bot and invite conversations from this browser.
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
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Ari" />
          </label>
          <label>
            Passcode
            <input
              type="password"
              value={passcode}
              onChange={(event) => setPasscode(event.target.value)}
              placeholder="something memorable"
            />
          </label>
          {authError && <p className="reply-error">{authError}</p>}
          <button type="submit" className="button primary">
            {authMode === "create" ? "Create account" : "Sign in"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="reply-app-shell" data-surface="reply">
      <header className="reply-app-topbar">
        <div className="reply-app-brand">
          <a href="/" className="site-header__brand-link" style={{ textDecoration: 'none' }}>
            <img src="/logo.png" alt="" style={{ width: 24, height: 24, marginRight: 8, borderRadius: 4, verticalAlign: 'middle', boxShadow: '0 0 24px rgba(240, 161, 58, 0.12)' }} />
            <span><span style={{ color: 'var(--amber)' }}>Stay</span>hand</span>
          </a>
          <small>reply mode</small>
        </div>
        <div className="reply-app-title">
          <strong>{displayConversationTitle(activeConversation, user)}</strong>
          <span>friction applies before every human send</span>
        </div>
        <div className="reply-app-stats">
          <strong>{stats.cooled}</strong> cooled
          <span>-</span>
          <strong>{stats.softened}</strong> softened
          <span>-</span>
          <strong>{stats.apologies}</strong> apologies
        </div>
        <button type="button" className="button ghost" onClick={signOut}>
          Sign out
        </button>
      </header>

      <section className="reply-app-layout">
        <aside className="reply-rail">
          <div className="reply-user-card">
            <span className="eyebrow">signed in</span>
            <strong>{user.displayName}</strong>
            <button type="button" className="button primary" onClick={createInviteLink}>
              Invite person
            </button>
            {(inviteUrl || inviteStatus) && (
              <div className="reply-invite-box">
                <span>{inviteStatus}</span>
                {inviteUrl && <input readOnly value={inviteUrl} onFocus={(event) => event.currentTarget.select()} />}
              </div>
            )}
          </div>

          <div className="reply-rail-section">
            <span className="eyebrow">conversations</span>
            <div className="reply-conversation-list">
              {conversations.map((conversation) => (
                <button
                  type="button"
                  key={conversation.id}
                  className={`reply-conversation-button ${conversation.id === activeId ? "is-active" : ""}`}
                  onClick={() => void loadMessages(conversation.id)}
                >
                  <strong>
                    {conversation.kind === "bot" && <span className="reply-bot-mark">bot</span>}
                    {displayConversationTitle(conversation, user)}
                  </strong>
                  <span>{conversation.lastMessage?.body ?? "No messages yet."}</span>
                </button>
              ))}
            </div>
          </div>

        </aside>

        <section className="reply-main">
          <div className="reply-thread-header">
            <div>
              <h1>
                {activeConversation?.kind === "bot" && <span className="reply-bot-heading">bot</span>}
                {displayConversationTitle(activeConversation, user)}
              </h1>
            </div>
          </div>

          <div ref={scrollRef} className="reply-thread">
            {!messages.length && (
              <div className="reply-empty">
                <span className="eyebrow">empty thread</span>
                <p>Start with a direct message. Stayhand will pause only when the draft needs it.</p>
              </div>
            )}
            {messages.map((message) => {
              const mine = message.senderId === user.id;
              return (
                <article key={message.id} className={`reply-message ${mine ? "reply-message--mine" : "reply-message--theirs"}`}>
                  <span className="reply-message__name">{message.senderName}</span>
                  <p>{message.body}</p>
                  {(message.friction?.cooled || message.friction?.apology) && (
                    <small>
                      {message.friction.apology
                        ? "sent with care"
                        : message.friction.cooled
                          ? "cooled first"
                          : ""}
                    </small>
                  )}
                </article>
              );
            })}
          </div>

          <div className="reply-composer-panel">
            <SoftenSheet
              open={showSoften}
              original={draft}
              softened={analysis.softened}
              onDismiss={() => setShowSoften(false)}
              onSendOriginal={sendOriginal}
              onSendSoftened={sendSoftened}
            />
            <CoolingDrawer items={cooling} onCancel={cancelCooling} onEdit={editCooling} onSendNow={sendCoolingNow} />
            {(review || reviewing) && (
              <section className="reply-review-card">
                <div className="reply-review-card__header">
                  <span className="eyebrow">ai review</span>
                  <div className="reply-review-card__header-right">
                    {review && (
                      <>
                        <span className={`reply-coach-badge reply-coach-badge--${review.analysis.heat_label}`}>
                          {review.analysis.heat_label}
                        </span>
                        <span className="reply-coach-badge reply-coach-badge--type">
                          {review.analysis.reply_type.replace(/_/g, " ")}
                        </span>
                      </>
                    )}
                    {review && review.analysis.heat_trajectory !== "stable" && (
                      <span className={`reply-trajectory-badge reply-trajectory-badge--${review.analysis.heat_trajectory}`}>
                        {review.analysis.heat_trajectory === "rising" ? "↑ rising heat" : "↓ cooling"}
                      </span>
                    )}
                    <button type="button" className="top-link subtle" onClick={() => setReview(null)}>
                      dismiss
                    </button>
                  </div>
                </div>
                {reviewing && <p className="reply-review-card__loading">reading the thread and checking tone...</p>}
                {review && (
                  <>
                    {/* Bot context chip */}
                    {review.analysis.bot_context_hint && (
                      <p className="reply-review-card__context-chip reply-review-card__context-chip--bot">
                        {review.analysis.bot_context_hint}
                      </p>
                    )}
                    {/* Human other-party state chip */}
                    {review.analysis.other_party_state && (
                      <p className="reply-review-card__context-chip reply-review-card__context-chip--human">
                        <span className="reply-review-card__context-label">reading the room · </span>
                        {review.analysis.other_party_state}
                      </p>
                    )}
                    {/* Main guidance */}
                    <p className="reply-review-card__guidance">{review.analysis.ai_review || review.analysis.guidance}</p>
                    {review.analysis.warning_badge && (
                      <span className="reply-warning-badge">{review.analysis.warning_badge}</span>
                    )}
                    {/* Risk factors as tags */}
                    {review.analysis.risk_factors.length > 0 && (
                      <div className="reply-review-card__risks">
                        {review.analysis.risk_factors.map((factor, i) => (
                          <span key={i} className="reply-risk-tag">{factor}</span>
                        ))}
                      </div>
                    )}
                    {/* Softened suggestion */}
                    <p className="reply-review-card__try">
                      <span>try:</span>
                      {review.analysis.try_message || review.suggestion}
                    </p>
                    <button type="button" className="top-link subtle reply-review-card__apply" onClick={applySuggestion}>
                      use try line
                    </button>
                  </>
                )}
              </section>
            )}

            <div className="reply-composer-row">
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setReview(null);
                }}
                placeholder={`reply to ${displayConversationTitle(activeConversation, user)}...`}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && analysis.heat < 50 && wordCount(draft) < 60) {
                    event.preventDefault();
                    handleSend();
                  }
                }}
              />
              <HoldSendButton
                heat={analysis.heat}
                category={analysis.category}
                disabled={!draft.trim() || sending || reviewing || !activeId}
                onSend={handleSend}
                onWantsCool={handleWantsCool}
                onApology={handleApology}
                neutralLabel={review ? "send now" : reviewing ? "reviewing..." : "review reply"}
              />
            </div>
            <HeatMeter heat={analysis.heat} loading={analyzing} />
          </div>
        </section>

      </section>

      <ReadAloudGate
        open={Boolean(pendingReadAloud)}
        text={pendingReadAloud?.text || ""}
        onConfirm={confirmReadAloud}
        onCancel={cancelReadAloud}
      />
    </main>
  );
}
