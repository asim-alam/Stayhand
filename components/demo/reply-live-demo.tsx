"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CoolingDrawer, type CoolingItem } from "@/components/real-mode/cooling-drawer";
import { HeatMeter } from "@/components/real-mode/heat-meter";
import { HoldSendButton } from "@/components/real-mode/hold-send-button";
import { ReadAloudGate } from "@/components/real-mode/read-aloud-gate";
import type { BotPersona, ReplyAnalyzeResult, ReplyCategory, ReplyCoachMessage } from "@/lib/real-mode/types";

type DemoBot = BotPersona & {
  id: string;
  opener: string;
  draft: string;
  fallbackReplies: string[];
};

type DemoMessage = {
  id: string;
  senderId: string;
  senderType: "user" | "bot";
  senderName: string;
  body: string;
  friction: {
    heat?: number;
    category?: ReplyCategory | string;
    cooled?: boolean;
    softened?: boolean;
    sentAnyway?: boolean;
  };
  createdAt: string;
};

type ReviewState = {
  original: string;
  suggestion: string;
  analysis: ReplyAnalyzeResult;
};

type PendingSend = {
  text: string;
  meta: DemoMessage["friction"];
};

const DEMO_USER = {
  id: "demo-user",
  displayName: "Ari",
};

const DEMO_BOTS: DemoBot[] = [
  {
    id: "bot-alex",
    name: "Alex",
    role: "conflict repair partner",
    personality: "sensitive but fair; names the emotional impact and responds better to accountability than defensiveness",
    opener:
      "i need to talk to you about something. i saw your message in the group chat and it felt like you were making fun of my idea in front of everyone. maybe i'm reading into it, but it stung.",
    draft: "I was not making fun of you. You are reading into this and making it a bigger deal than it is.",
    fallbackReplies: [
      "i can hear that better. i just needed to know you understood why it landed badly.",
      "that helps more than arguing the details. what i need is for it not to happen in front of everyone again.",
    ],
  },
  {
    id: "bot-maya",
    name: "Maya",
    role: "deadline-focused coworker",
    personality: "direct, practical, low patience for vague replies; wants ownership and a specific next step",
    opener:
      "quick check: you told the client we'd deliver friday, but i didn't see the final files. are we actually ready or am i walking into another surprise?",
    draft: "Relax. I said friday because that is what made sense at the time. I cannot update you every hour.",
    fallbackReplies: [
      "i need a concrete answer, not a vibe. what is done and what is still moving?",
      "thanks. if you own the next update, i can stop guessing.",
    ],
  },
  {
    id: "bot-priya",
    name: "Priya",
    role: "calm mediator",
    personality: "measured, curious, and clarifying; helps turn tension into a concrete shared decision",
    opener:
      "before this gets bigger, can we name the actual disagreement? i think we're reacting to different versions of the problem.",
    draft: "The disagreement is that everyone keeps overcomplicating this. I already said what I think we should do.",
    fallbackReplies: [
      "that gives us something to work with. what decision do you want from this conversation?",
      "good. let's separate the feeling from the request so neither gets lost.",
    ],
  },
];

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
};

function createMessage(bot: DemoBot, body: string, sender: "user" | "bot", friction: DemoMessage["friction"] = {}): DemoMessage {
  const isUser = sender === "user";
  return {
    id: `${sender}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    senderId: isUser ? DEMO_USER.id : bot.id,
    senderType: sender,
    senderName: isUser ? DEMO_USER.displayName : bot.name,
    body,
    friction,
    createdAt: new Date().toISOString(),
  };
}

function initialMessages(): Record<string, DemoMessage[]> {
  return Object.fromEntries(DEMO_BOTS.map((bot) => [
    bot.id,
    [{
      id: `${bot.id}_opener`,
      senderId: bot.id,
      senderType: "bot" as const,
      senderName: bot.name,
      body: bot.opener,
      friction: {},
      createdAt: "2026-04-24T00:00:00.000Z",
    }],
  ]));
}

function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function fallbackAnalysis(bot: DemoBot, draft: string): ReplyAnalyzeResult {
  return {
    should_intervene: true,
    intervention_reason: "High heat detected",
    reply_type: "de_escalation",
    verdict: "needs_improvement",
    heat_label: "tense",
    issue_type: "too_aggressive",
    ai_review: `${bot.name} is asking for acknowledgment first; this draft argues intent and will probably make the tension worse.`,
    why_appeared: "High heat detected",
    warning_badge: "tone may escalate",
    try_message: `I hear why that landed badly, ${bot.name}. I was trying to respond quickly, but I can see how it came across. Let me reset and answer the actual concern.`,
    heat: 72,
    category: "charged",
    softened: `I hear why that landed badly, ${bot.name}. I was trying to respond quickly, but I can see how it came across. Let me reset and answer the actual concern.`,
    guidance: `${bot.name} is asking for acknowledgment first; this draft argues intent and will probably make the tension worse.`,
    risk_factors: ["argues intent instead of impact", "sounds dismissive", "misses the actual concern"],
    recommended_cooldown_seconds: 15,
    heat_trajectory: "stable",
    bot_context_hint: `${bot.name} responds better to accountability than defensiveness.`,
  };
}

export function ReplyLiveDemo() {
  const searchParams = useSearchParams();
  const judgeMode = searchParams.get("judge") === "1";
  const [activeBotId, setActiveBotId] = useState(DEMO_BOTS[0].id);
  const [messagesByBot, setMessagesByBot] = useState<Record<string, DemoMessage[]>>(() => initialMessages());
  const [draftsByBot, setDraftsByBot] = useState<Record<string, string>>(() =>
    Object.fromEntries(DEMO_BOTS.map((bot) => [bot.id, bot.draft]))
  );
  const [analysis, setAnalysis] = useState<ReplyAnalyzeResult>(EMPTY_ANALYSIS);
  const [review, setReview] = useState<ReviewState | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [cooling, setCooling] = useState<CoolingItem[]>([]);
  const [pendingReadAloud, setPendingReadAloud] = useState<PendingSend | null>(null);
  const [status, setStatus] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeBot = useMemo(
    () => DEMO_BOTS.find((bot) => bot.id === activeBotId) ?? DEMO_BOTS[0],
    [activeBotId]
  );
  const messages = messagesByBot[activeBot.id] ?? [];
  const draft = draftsByBot[activeBot.id] ?? "";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, activeBot.id]);

  useEffect(() => {
    if (!cooling.length) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      const ready = cooling.filter((item) => item.sendsAt <= now);
      if (ready.length) {
        ready.forEach((item) => deliverDemoMessage(item.text, { cooled: true, heat: analysis.heat, category: analysis.category }));
        setCooling((prev) => prev.filter((item) => item.sendsAt > now));
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [cooling, analysis.category, analysis.heat]);

  function setDraft(next: string) {
    setDraftsByBot((previous) => ({ ...previous, [activeBot.id]: next }));
  }

  function selectBot(botId: string) {
    const bot = DEMO_BOTS.find((item) => item.id === botId);
    if (!bot) return;
    setActiveBotId(bot.id);
    setAnalysis(EMPTY_ANALYSIS);
    setReview(null);
    setStatus("");
    setCooling([]);
  }

  function conversationContextForAnalysis(): ReplyCoachMessage[] {
    return messages.slice(-10).map((message) => ({
      speaker_type: message.senderType === "user" ? "user" as const : "other_person" as const,
      speaker_name: message.senderName,
      message: message.body,
      timestamp: message.createdAt,
      heat: typeof message.friction.heat === "number" ? message.friction.heat : undefined,
    }));
  }

  async function reviewDraft() {
    const text = draft.trim();
    if (!text) return;
    setReviewing(true);
    setReview(null);
    setStatus("");

    try {
      const latestIncoming = [...messages].reverse().find((message) => message.senderType === "bot");
      const response = await fetch("/api/reply/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft: text,
          conversation_context: conversationContextForAnalysis(),
          latest_incoming_message: latestIncoming
            ? {
                speaker_type: "other_person",
                speaker_name: latestIncoming.senderName,
                message: latestIncoming.body,
                timestamp: latestIncoming.createdAt,
              }
            : null,
          user_draft: {
            speaker_type: "user",
            speaker_name: DEMO_USER.displayName,
            message: text,
            timestamp: new Date().toISOString(),
          },
          context: `demo conversation: ${activeBot.name}`,
          botPersona: {
            name: activeBot.name,
            role: activeBot.role,
            personality: activeBot.personality,
          },
          conversationKind: "bot",
          userName: DEMO_USER.displayName,
        }),
      });
      const data = (await response.json()) as { result?: ReplyAnalyzeResult; error?: string };
      if (!response.ok || !data.result) {
        throw new Error(data.error || "review failed");
      }
      const next = data.result;
      setAnalysis(next);

      if (next.should_intervene === false) {
        sendNow(text, { heat: next.heat, category: next.category });
        return;
      }

      setReview({
        original: text,
        suggestion: next.try_message.trim() || next.softened.trim() || text,
        analysis: next,
      });
    } catch {
      const next = fallbackAnalysis(activeBot, text);
      setAnalysis(next);
      setReview({ original: text, suggestion: next.softened, analysis: next });
    } finally {
      setReviewing(false);
    }
  }

  function deliverDemoMessage(text: string, friction: DemoMessage["friction"]) {
    const clean = text.trim();
    if (!clean) return;
    const userMessage = createMessage(activeBot, clean, "user", friction);
    const botReply = activeBot.fallbackReplies[messages.length % activeBot.fallbackReplies.length] || activeBot.fallbackReplies[0];
    const botMessage = createMessage(activeBot, botReply, "bot");
    setMessagesByBot((previous) => ({
      ...previous,
      [activeBot.id]: [...(previous[activeBot.id] ?? []), userMessage, botMessage],
    }));
    setDraft("");
    setAnalysis(EMPTY_ANALYSIS);
    setReview(null);
    setStatus(friction.softened ? "sent the safer draft." : friction.cooled ? "sent after cooling." : "sent in demo mode.");
  }

  function maybeRequireReadAloud(payload: PendingSend): boolean {
    if (wordCount(payload.text) < 60) return false;
    setPendingReadAloud(payload);
    return true;
  }

  function sendNow(text: string, friction: DemoMessage["friction"]) {
    if (maybeRequireReadAloud({ text, meta: friction })) return;
    deliverDemoMessage(text, friction);
  }

  function sendReviewedDraft() {
    const text = draft.trim();
    if (!text) return;
    sendNow(text, {
      heat: review?.analysis.heat ?? analysis.heat,
      category: review?.analysis.category ?? analysis.category,
      softened: Boolean(review && text !== review.original),
    });
  }

  function handlePrimaryAction() {
    if (review) {
      sendReviewedDraft();
      return;
    }
    void reviewDraft();
  }

  function handleWantsCool() {
    const text = draft.trim();
    if (!text) return;
    setCooling((previous) => [
      ...previous,
      { id: `cool_${Date.now()}`, text, sendsAt: Date.now() + Math.max(analysis.recommended_cooldown_seconds, 15) * 1000 },
    ]);
    setDraft("");
    setReview(null);
    setStatus("cooling the draft before release.");
  }

  function applySuggestion() {
    if (!review) return;
    setDraft(review.suggestion);
  }

  function cancelCooling(id: string) {
    setCooling((previous) => previous.filter((item) => item.id !== id));
  }

  function editCooling(id: string, nextText: string) {
    setCooling((previous) =>
      previous.map((item) => (item.id === id ? { ...item, text: nextText, sendsAt: Date.now() + 15000 } : item))
    );
  }

  function sendCoolingNow(id: string) {
    const item = cooling.find((candidate) => candidate.id === id);
    if (!item) return;
    setCooling((previous) => previous.filter((candidate) => candidate.id !== id));
    deliverDemoMessage(item.text, { cooled: true, sentAnyway: true, heat: analysis.heat, category: analysis.category });
  }

  function confirmReadAloud() {
    if (!pendingReadAloud) return;
    deliverDemoMessage(pendingReadAloud.text, pendingReadAloud.meta);
    setPendingReadAloud(null);
  }

  return (
    <main className="reply-app-shell demo-reply-shell" data-surface="reply">
      <header className="reply-app-topbar">
        <div className="reply-app-brand">
          <a href="/" className="site-header__brand-link" style={{ textDecoration: 'none' }}>
            <img src="/logo.png" alt="" style={{ width: 24, height: 24, marginRight: 8, borderRadius: 4, verticalAlign: 'middle', boxShadow: '0 0 24px rgba(240, 161, 58, 0.12)' }} />
            <span><span style={{ color: 'var(--amber)' }}>Stay</span>hand</span>
          </a>
          <small>{judgeMode ? "reply judge demo" : "reply demo"}</small>
        </div>
        <div className="reply-app-title">
          <strong>{activeBot.name}</strong>
          <span>same review flow, prefilled draft</span>
        </div>
        <div className="reply-app-stats">
          <strong>3</strong> bots
          <span>-</span>
          <strong>{review ? 1 : 0}</strong> review
          <span>-</span>
          <strong>{cooling.length}</strong> cooling
        </div>
        <div className="row">
          <a href="/demo" className="button ghost">Demo picker</a>
          <a href="/reply" className="button primary">Try live</a>
        </div>
      </header>

      <section className="reply-app-layout">
        <aside className="reply-rail">
          <div className="reply-user-card">
            <span className="eyebrow">demo account</span>
            <strong>{DEMO_USER.displayName}</strong>
            <span className="real-help">No sign-in. No database writes. The draft is already loaded.</span>
          </div>

          <div className="reply-rail-section">
            <span className="eyebrow">bot conversations</span>
            <div className="reply-conversation-list">
              {DEMO_BOTS.map((bot) => (
                <button
                  key={bot.id}
                  type="button"
                  className={`reply-conversation-button ${bot.id === activeBot.id ? "is-active" : ""}`}
                  onClick={() => selectBot(bot.id)}
                >
                  <strong>
                    <span className="reply-bot-mark">bot</span>
                    {bot.name}
                  </strong>
                  <span>{bot.role}</span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="reply-main">
          <div className="reply-thread-header">
            <div>
              <h1><span className="reply-bot-heading">bot</span>{activeBot.name}</h1>
            </div>
            <div className="reply-memory">
              <span>persona</span>
              <p>{activeBot.personality}</p>
            </div>
          </div>

          <div ref={scrollRef} className="reply-thread">
            {messages.map((message) => {
              const mine = message.senderType === "user";
              return (
                <article key={message.id} className={`reply-message ${mine ? "reply-message--mine" : "reply-message--theirs"}`}>
                  <span className="reply-message__name">{message.senderName}</span>
                  <p>{message.body}</p>
                  {(message.friction.cooled || message.friction.softened) && (
                    <small>{message.friction.softened ? "softened first" : "cooled first"}</small>
                  )}
                </article>
              );
            })}
          </div>

          <div className="reply-composer-panel">
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
                    <button type="button" className="top-link subtle" onClick={() => setReview(null)}>
                      dismiss
                    </button>
                  </div>
                </div>
                {reviewing && <p className="reply-review-card__loading">reading the thread and checking tone...</p>}
                {review && (
                  <>
                    {review.analysis.bot_context_hint && (
                      <p className="reply-review-card__context-chip reply-review-card__context-chip--bot">
                        {review.analysis.bot_context_hint}
                      </p>
                    )}
                    {(review.analysis.other_party_emotion || review.analysis.other_party_state) && (
                      <p className="reply-review-card__context-chip reply-review-card__context-chip--human">
                        <span className="reply-review-card__context-label">reading the room · </span>
                        {review.analysis.other_party_emotion || review.analysis.other_party_state}
                      </p>
                    )}
                    <p className="reply-review-card__guidance">{review.analysis.ai_review || review.analysis.guidance}</p>
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

            {status && <p className="real-help">{status}</p>}

            <div className="reply-composer-row">
              <textarea
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setReview(null);
                }}
                placeholder={`reply to ${activeBot.name}...`}
              />
              <HoldSendButton
                heat={analysis.heat}
                category={analysis.category}
                disabled={!draft.trim() || reviewing}
                onSend={handlePrimaryAction}
                onWantsCool={handleWantsCool}
                onApology={handlePrimaryAction}
                neutralLabel={review ? "send now" : reviewing ? "reviewing..." : "review reply"}
              />
            </div>
            <HeatMeter heat={analysis.heat} loading={reviewing} />
            {judgeMode && status && (
              <div className="row">
                <a href="/results" className="button ghost">View results</a>
              </div>
            )}
          </div>
        </section>
      </section>

      <ReadAloudGate
        open={Boolean(pendingReadAloud)}
        text={pendingReadAloud?.text || ""}
        onConfirm={confirmReadAloud}
        onCancel={() => setPendingReadAloud(null)}
      />
    </main>
  );
}
