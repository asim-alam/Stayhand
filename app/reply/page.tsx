"use client";

import { useEffect, useRef, useState } from "react";
import { CoolingDrawer, type CoolingItem } from "@/components/real-mode/cooling-drawer";
import { HeatMeter } from "@/components/real-mode/heat-meter";
import { HoldSendButton } from "@/components/real-mode/hold-send-button";
import { ReadAloudGate } from "@/components/real-mode/read-aloud-gate";
import { SoftenSheet } from "@/components/real-mode/soften-sheet";
import { AuthControl } from "@/components/shared/auth-control";
import type { ReplyAnalyzeResult, ReplyCategory, ReplyCoachMessage, BotPersona, MessageOutcome, UserActionType } from "@/lib/real-mode/types";

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
  outcome?: MessageOutcome;
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
  should_intervene: false,
  intervention_reason: "",
  reply_type: "other",
  verdict: "good",
  heat_label: "calm",
  issue_type: "none",
  ai_review: "",
  why_appeared: "",
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
  const [loading, setLoading] = useState(true);
  const [conversationsLoading, setConversationsLoading] = useState(false);

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
  const [composerError, setComposerError] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const activeIdRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Polling fallback: re-fetch messages every 3 s so the other person's messages appear
  // even when the WebSocket connection isn't available (e.g. during dev with Turbopack).
  useEffect(() => {
    if (!user || !activeId) return;

    // Clear any previous timer whenever activeId changes
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/reply/messages?conversationId=${encodeURIComponent(activeId)}`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          messages?: ReplyMessage[];
          memory?: string;
          conversation?: ReplyConversation;
        };
        if (data.messages) {
          setMessages((prev) => mergeMessages(prev, data.messages!));
        }
        if (data.conversation) {
          setActiveConversation(data.conversation);
          setConversations((prev) => mergeConversations(prev, data.conversation!));
        }
        if (data.memory) {
          setMemory(data.memory);
        }
      } catch {
        // ignore network errors between polls
      }
    }, 1500); // 1.5s — tight enough to feel near-real-time

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [user, activeId]);

  useEffect(() => {
    if (!session) return;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let destroyed = false;

    function connect() {
      if (destroyed) return;
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${protocol}://${window.location.host}/ws/reply?session=${encodeURIComponent(session!)}`);

      ws.onmessage = (event) => {
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

      ws.onclose = () => {
        if (!destroyed) {
          // Auto-reconnect after 2 seconds so real-time stays alive
          reconnectTimer = setTimeout(connect, 2000);
        }
      };
    }

    connect();
    return () => {
      destroyed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [session]);

  useEffect(() => {
    if (review) return;
    if (!draft.trim()) {
      setAnalysis(EMPTY_ANALYSIS);
      setShowSoften(false);
      setComposerError("");
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
            conversationId: activeId,
            draft: draft.trim(),
            ...buildCoachPayload(messages, user, draft),
            context: `conversation: ${activeConversation?.title || "reply workspace"}`,
            botPersona,
            conversationKind,
            otherPartyName,
            userName: user?.displayName,
          }),
        });
        const data = (await response.json()) as { result?: ReplyAnalyzeResult; error?: string };
        if (!response.ok) {
          throw new Error(data.error ?? "failed to analyze reply");
        }
        if (cancelled) return;
        const next = data.result ?? EMPTY_ANALYSIS;
        setAnalysis(next);
        setShowSoften(false);
        setComposerError("");
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
  }, [activeConversation, draft, messages, user, review]);


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
    // Phase 1: auth check — fast (sessionv2 tokens decode in memory, no DB hit)
    setLoading(true);
    try {
      const response = await fetch("/api/auth/me", { cache: "no-store" });
      const data = (await response.json()) as { user: ReplyUser | null; session: string | null };
      if (!data.user) {
        // Redirect silently — stay on loading screen until navigation completes
        const callback = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.replace(`/login?callbackUrl=${callback}`);
        return; // setLoading stays true, screen stays blank until redirect fires
      }
      setUser(data.user);
      setSession(data.session);
      setLoading(false); // Show UI shell immediately — don't wait for conversations

      // Phase 2: load conversations in background (sidebar shows a loading state)
      setConversationsLoading(true);
      try {
        await loadConversations(getInitialConversationId(), data.user);
      } finally {
        setConversationsLoading(false);
      }
    } catch {
      setLoading(false);
    }
  }

  async function loadConversations(preferredId?: string | null, userOverride?: ReplyUser) {
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
    setComposerError("");
    inputRef.current?.focus();
  }

  function maybeRequireReadAloud(payload: PendingSend): boolean {
    if (wordCount(payload.text) < 60) return false;
    setPendingReadAloud(payload);
    return true;
  }

  async function deliverMessage(body: string, meta: SendMeta, outcomeData?: any) {
    if (!activeId || !body.trim()) return;
    // Optimistic UI: show the sender's message instantly before server confirms
    const optimisticId = `optimistic_${Date.now()}`;
    if (user) {
      const optimisticMsg: ReplyMessage = {
        id: optimisticId,
        conversationId: activeId,
        senderId: user.id,
        senderType: "user",
        senderName: user.displayName,
        body: body.trim(),
        friction: meta,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => mergeMessages(prev, [optimisticMsg]));
    }
    setSending(true);
    try {
      const response = await fetch("/api/reply/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeId, body, friction: meta, outcomeData }),
      });
      const data = (await response.json()) as {
        created?: ReplyMessage[];
        conversation?: ReplyConversation;
        error?: string;
      };
      if (!response.ok || !data.created || !data.conversation) {
        throw new Error(data.error ?? "failed to send message");
      }
      // Replace optimistic message with real server-confirmed messages
      setMessages((prev) => mergeMessages(prev.filter((m) => m.id !== optimisticId), data.created!));
      setConversations((prev) => mergeConversations(prev, data.conversation!));
      setActiveConversation(data.conversation);
      setMemory(data.conversation.memory);
      setComposerError("");
    } catch (error) {
      // On failure, remove the optimistic message
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      const message = error instanceof Error ? error.message : "failed to send message";
      setComposerError(message);
      if (message === "sign in required") {
        const callback = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `/login?callbackUrl=${callback}`;
      }
    } finally {
      setSending(false);
    }
  }

  function sendNow(text: string, meta: SendMeta, outcomeData?: any) {
    if (maybeRequireReadAloud({ text, meta, outcome: outcomeData })) return;
    void deliverMessage(text, meta, outcomeData);
    resetComposer();
  }

  function buildOutcomeData(action: UserActionType) {
    if (!review || !activeConversation) return undefined;
    const otherPartyName = activeConversation.kind === "human"
      ? activeConversation.participants.find((p) => p.type === "user" && p.id !== user?.id)?.displayName || "Unknown"
      : activeConversation.title;
      
    const incoming = [...messages].reverse().find((message) => message.senderId !== user?.id)?.body || "";
      
    return {
      userAction: action,
      originalDraft: review.original,
      reviewData: review.analysis,
      otherPartyName,
      latestIncomingMessage: incoming,
    };
  }

  async function logOutcome(action: UserActionType, finalMessage: string) {
    if (!review || !activeConversation) return;
    const outcomeData = buildOutcomeData(action);
    if (!outcomeData) return;

    await fetch("/api/outcomes/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...outcomeData, finalMessage, conversationId: activeId, surface: "reply" }),
    });
  }

  async function reviewDraft(meta: SendMeta = {}) {
    const text = draft.trim();
    if (!text) return;
    setReviewing(true);
    setReview(null);
    setComposerError("");
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
          conversationId: activeId,
          draft: text,
          ...buildCoachPayload(messages, user, text),
          context: `conversation: ${displayConversationTitle(activeConversation, user)}`,
          botPersona,
          conversationKind,
          otherPartyName,
          userName: user?.displayName,
        }),
      });
      const data = (await response.json()) as { result?: ReplyAnalyzeResult; error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "failed to review draft");
      }
      const next = data.result ?? analysis;
      const suggestion = next.try_message?.trim() || next.softened?.trim() || text;
      setAnalysis(next);
      
      const newMeta = { ...meta, heat: next.heat, category: meta.category ?? next.category };

      if (next.should_intervene === false) {
        sendNow(text, newMeta);
        return;
      }

      setReview({
        original: text,
        suggestion,
        analysis: next,
        meta: newMeta,
      });
      setComposerError("");
    } catch (error) {
      setComposerError(error instanceof Error ? error.message : "failed to review draft");
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
    if (review) void logOutcome("cooled", text);
    const delay = Math.max(analysis.recommended_cooldown_seconds || 30, 15);
    setCooling((prev) => [...prev, { id: crypto.randomUUID(), text, sendsAt: Date.now() + delay * 1000 }]);
    resetComposer();
  }

  function handleDismiss() {
    if (review) void logOutcome("dismissed", draft);
    setReview(null);
  }

  function sendOriginal() {
    const text = review?.original ?? draft.trim();
    if (!text) return;
    const outcomeData = review ? buildOutcomeData("sent_original") : undefined;
    sendNow(text, { ...(review?.meta ?? {}), sentAnyway: true, heat: review?.analysis.heat ?? analysis.heat, category: review?.analysis.category ?? analysis.category }, outcomeData);
  }

  function sendSoftened() {
    const text = review?.suggestion.trim() || analysis.softened.trim();
    if (!text) return;
    const outcomeData = review ? buildOutcomeData("used_try") : undefined;
    sendNow(text, { ...(review?.meta ?? {}), softened: true, heat: review?.analysis.heat ?? analysis.heat, category: review?.analysis.category ?? analysis.category }, outcomeData);
  }

  function sendReviewedDraft() {
    if (!review) return;
    const text = draft.trim();
    if (!text) return;
    const action = text === review.suggestion ? "used_try" : (text === review.original ? "sent_original" : "edited_try");
    const outcomeData = buildOutcomeData(action);
    sendNow(text, {
      ...review.meta,
      softened: text !== review.original,
      heat: review.analysis.heat,
      category: review.analysis.category,
    }, outcomeData);
  }

  function applySuggestion() {
    if (!review) return;
    setDraft(review.suggestion);
  }

  function confirmReadAloud() {
    if (!pendingReadAloud) return;
    void deliverMessage(pendingReadAloud.text, pendingReadAloud.meta, pendingReadAloud.outcome);
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

  // Show nothing while loading or during redirect — avoids the brief black/login flash.
  if (loading || !user) {
    return <main className="reply-app-shell" />;
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
        <AuthControl />
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
              {conversationsLoading && conversations.length === 0 && (
                <p style={{ opacity: 0.45, fontSize: "0.8rem", padding: "8px 4px", animation: "pulse 1.4s ease-in-out infinite" }}>
                  loading conversations…
                </p>
              )}
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
            {process.env.NODE_ENV === "development" && (
              <div style={{ marginTop: 20, padding: 10, background: "rgba(0,0,0,0.5)", fontSize: 10, fontFamily: "monospace", borderRadius: 4, maxHeight: 150, overflow: "auto" }}>
                <strong>Coach Debug:</strong>
                <pre style={{ margin: 0 }}>{JSON.stringify(analysis, null, 2)}</pre>
              </div>
            )}
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
                        <span className="reply-coach-badge">
                          {review.analysis.why_appeared}
                        </span>
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
                    <button type="button" className="top-link subtle" onClick={handleDismiss}>
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
                    {/* Human other-party state/emotion chip */}
                    {(review.analysis.other_party_emotion || review.analysis.other_party_state) && (
                      <p className="reply-review-card__context-chip reply-review-card__context-chip--human">
                        <span className="reply-review-card__context-label">reading the room · </span>
                        {review.analysis.other_party_emotion || review.analysis.other_party_state}
                      </p>
                    )}
                    {/* Main guidance */}
                    <p className="reply-review-card__guidance">{review.analysis.ai_review || review.analysis.guidance}</p>
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
                neutralLabel={review ? "send now" : reviewing ? "reviewing..." : activeConversation?.kind === "human" ? "review reply" : "send reply"}
              />
            </div>
            {composerError && <p className="reply-error" style={{ marginTop: 8 }}>{composerError}</p>}
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
