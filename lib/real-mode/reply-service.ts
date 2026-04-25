import { clamp } from "@/lib/runtime/utils";
import { generateJson } from "@/lib/real-mode/gemini";
import type {
  ReplyAnalyzeRequest,
  ReplyAnalyzeResult,
  ReplyCategory,
  ReplyCoachMessage,
  ReplyHeatLabel,
  ReplyIssueType,
  ReplyType,
  ReplyVerdict,
  ThreadMessage,
} from "@/lib/real-mode/types";

const REPLY_TYPES: ReplyType[] = [
  "apology",
  "clarification",
  "disagreement",
  "explanation",
  "question",
  "reassurance",
  "boundary_setting",
  "de_escalation",
  "casual_reply",
  "correction",
  "empathy",
  "direct_answer",
  "other",
];

const ISSUE_TYPES: ReplyIssueType[] = [
  "none",
  "off_topic",
  "too_aggressive",
  "too_vague",
  "misses_question",
  "missing_empathy",
  "unclear",
  "contradicts_context",
];

const APOLOGY_PATTERNS = [
  "i'm sorry",
  "im sorry",
  "sorry",
  "that was on me",
  "i was wrong",
  "my fault",
  "i apologize",
];

const HOT_PATTERNS = [
  "always",
  "never",
  "can't believe",
  "cannot believe",
  "you don't care",
  "whatever",
  "stop",
  "sick of",
  "fed up",
];

const BANNED_REVIEW_PHRASES = [
  "they raised something specific",
  "raised something specific",
  "make sure your reply directly addresses what they said",
  "may not address what they actually said",
  "may not address what",
  "what they actually said",
];

type CoachPayload = {
  conversation_context: ReplyCoachMessage[];
  latest_incoming_message: ReplyCoachMessage | null;
  user_draft: ReplyCoachMessage;
};

type RawCoachResponse = {
  should_intervene?: unknown;
  intervention_reason?: unknown;
  reply_type?: unknown;
  verdict?: unknown;
  heat?: unknown;
  risk_score?: unknown;
  issue_type?: unknown;
  ai_review?: unknown;
  warning_badge?: unknown;
  try_message?: unknown;
  why_appeared?: unknown;
  risk_factors?: unknown;
  recommended_cooldown_seconds?: unknown;
  other_party_state?: unknown;
  bot_context_hint?: unknown;
};

function lc(value: string): string {
  return value.toLowerCase();
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function contentWords(value: string): string[] {
  return unique(
    lc(value)
      .replace(/[^a-z0-9\s']/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 3)
      .filter((word) => !["this", "that", "with", "from", "have", "just", "what", "when", "where", "your", "them", "they", "about", "would", "could", "should"].includes(word))
  );
}

function extractTopic(message: string): string {
  const clean = message.trim();
  if (!clean) return "";
  const firstSentence = clean.split(/[.!?]/)[0]?.trim() || clean;
  if (firstSentence.length <= 90) return firstSentence;
  return `${firstSentence.slice(0, 87).replace(/\s+\S*$/, "")}...`;
}

function latestFromContext(context: ReplyCoachMessage[]): ReplyCoachMessage | null {
  return [...context].reverse().find((message) => message.speaker_type === "other_person") ?? null;
}

function legacyThreadToContext(thread: ThreadMessage[] | undefined, userName: string): ReplyCoachMessage[] {
  return (thread ?? []).slice(-10).map((message) => ({
    speaker_type: lc(message.senderName) === lc(userName) || message.senderType === "user" ? "user" : "other_person",
    speaker_name: message.senderName,
    message: message.body,
    heat: message.heat,
  }));
}

function normalizeCoachPayload(input: ReplyAnalyzeRequest): CoachPayload {
  const userName = input.userName || input.userDraft?.speaker_name || "user";
  const context = (input.conversationContext?.length
    ? input.conversationContext
    : legacyThreadToContext(input.thread, userName))
    .filter((message) => message.message.trim())
    .slice(-10);

  const latestIncoming = input.latestIncomingMessage?.message.trim()
    ? input.latestIncomingMessage
    : input.incomingMessage?.trim()
      ? {
          speaker_type: "other_person" as const,
          speaker_name: input.otherPartyName || input.botPersona?.name || "the other person",
          message: input.incomingMessage.trim(),
        }
      : latestFromContext(context);

  const userDraft = input.userDraft?.message.trim()
    ? input.userDraft
    : {
        speaker_type: "user" as const,
        speaker_name: userName,
        message: input.draft.trim(),
      };

  return {
    conversation_context: context,
    latest_incoming_message: latestIncoming,
    user_draft: userDraft,
  };
}

function heatScoreToLabel(score: number): ReplyHeatLabel {
  if (score >= 70) return "tense";
  if (score >= 35) return "rising";
  return "calm";
}

function labelToHeatScore(label: ReplyHeatLabel): number {
  if (label === "tense") return 82;
  if (label === "rising") return 55;
  return 18;
}

function categoryFrom(replyType: ReplyType, heatLabel: ReplyHeatLabel, heat: number): ReplyCategory {
  if (replyType === "apology") return "apology";
  return heatLabel === "calm" && heat < 50 ? "neutral" : "charged";
}

function computeHeatTrajectory(context: ReplyCoachMessage[]): ReplyAnalyzeResult["heat_trajectory"] {
  const userMessages = context
    .filter((message) => message.speaker_type === "user" && typeof message.heat === "number")
    .slice(-10);

  if (userMessages.length < 4) return "stable";

  const half = Math.floor(userMessages.length / 2);
  const early = userMessages.slice(0, half);
  const recent = userMessages.slice(-half);
  const average = (messages: ReplyCoachMessage[]) =>
    messages.reduce((sum, message) => sum + (message.heat ?? 0), 0) / messages.length;
  const diff = average(recent) - average(early);

  if (diff >= 15) return "rising";
  if (diff <= -15) return "falling";
  return "stable";
}

function buildUserBehaviourSummary(context: ReplyCoachMessage[]): string {
  const userMessages = context.filter((message) => message.speaker_type === "user");
  if (!userMessages.length) return "No messages sent yet.";

  const heatValues = userMessages.map((message) => message.heat ?? 0);
  const averageHeat = Math.round(heatValues.reduce((sum, heat) => sum + heat, 0) / heatValues.length);
  const hotSends = heatValues.filter((heat) => heat >= 60).length;
  const parts = [`${userMessages.length} message${userMessages.length === 1 ? "" : "s"} sent`, `avg heat ${averageHeat}/100`];
  if (hotSends) parts.push(`${hotSends} high-heat send${hotSends === 1 ? "" : "s"}`);
  return `${parts.join(", ")}.`;
}

// Vague one-liners that carry no specific intent
const VAGUE_DRAFTS = ["what do you mean", "ok", "okay", "huh", "explain", "tell me", "really", "sure", "fine", "what"];

function isMeaningfulRewrite(draft: string, tryMessage: string, issueType: ReplyIssueType): boolean {
  const d = draft.trim().toLowerCase();
  const t = tryMessage.trim().toLowerCase();
  if (!t || t === d) return false;
  if (issueType === "too_vague" || issueType === "misses_question" || issueType === "unclear") {
    if (t.length <= d.length + 12) return false;
    const addedWords = contentWords(tryMessage).filter((w) => !contentWords(draft).includes(w));
    return addedWords.length >= 3;
  }
  return true;
}

function reconcileCoachLabels(result: ReplyAnalyzeResult): ReplyAnalyzeResult {
  const next = { ...result };
  const tryIsQuestion = next.try_message.trim().endsWith("?");
  // Fix contradictory reply_type
  if (tryIsQuestion && next.reply_type === "direct_answer") next.reply_type = "clarification";
  if (next.try_message && !tryIsQuestion && next.reply_type === "question") next.reply_type = "other";
  // Fix contradictory verdict
  if (next.issue_type !== "none" && next.verdict === "good") next.verdict = "needs_improvement";
  if (next.warning_badge && next.verdict === "good") next.verdict = "needs_improvement";
  // Consistency rule for should_intervene
  if (!next.should_intervene) {
    next.verdict = "good";
    next.issue_type = "none";
    next.warning_badge = null;
    next.ai_review = "";
    next.try_message = "";
    next.why_appeared = "";
  } else {
    // Add missing badge for vague issues
    if (next.issue_type === "too_vague" && !next.warning_badge) next.warning_badge = "needs more clarity";
    if (next.issue_type === "too_aggressive" && !next.warning_badge) next.warning_badge = "tone may escalate";
    if (next.issue_type === "misses_question" && !next.warning_badge) next.warning_badge = "misses the question";
  }
  return next;
}

function buildFallbackTryMessage(input: ReplyAnalyzeRequest, payload: CoachPayload, replyType: ReplyType, issueType: ReplyIssueType): string {
  const draft = payload.user_draft.message.trim();
  const latest = payload.latest_incoming_message?.message.trim() || "";
  const lowerDraft = lc(draft);
  const lowerLatest = lc(latest);
  const otherName = payload.latest_incoming_message?.speaker_name || input.otherPartyName || input.botPersona?.name || "you";

  if (!draft) return "";

  // For vague drafts when there is a latest incoming message, generate a grounded clarifying question
  const isVagueDraft = VAGUE_DRAFTS.some((v) => lowerDraft === v || lowerDraft.replace(/[?.!]+$/, "") === v);
  if ((isVagueDraft || draft.length < 16) && latest) {
    // Extract a topic fragment from the latest message to ground the question
    const topicWords = contentWords(latest).slice(0, 3).join(" ");
    if (topicWords) {
      return `What part about ${topicWords} do you want me to clarify first? I can explain what I know.`;
    }
    return `Can you tell me which part you need me to explain? I want to make sure I answer the right thing.`;
  }

  if (replyType === "apology" || APOLOGY_PATTERNS.some((pattern) => lowerDraft.includes(pattern))) {
    return draft.replace(/\bbut\b.*/i, "").trim();
  }

  if (HOT_PATTERNS.some((pattern) => lowerDraft.includes(pattern))) {
    return draft
      .replace(/\byou always\b/gi, "this keeps happening")
      .replace(/\byou never\b/gi, "this still isn't happening")
      .replace(/\bi can't believe\b/gi, "I'm frustrated that")
      .replace(/\byou don't care\b/gi, "it feels like this isn't landing");
  }

  // For too_vague / misses_question issues, never return an unchanged draft
  if ((issueType === "too_vague" || issueType === "misses_question") && latest) {
    const firstQ = latest.split(/[.!?]/)[0]?.trim() || latest.slice(0, 60);
    return `I hear you — ${firstQ.toLowerCase()}. Let me give you a clearer answer.`;
  }

  return draft;
}

export function buildFallbackAnalysis(input: ReplyAnalyzeRequest): ReplyAnalyzeResult {
  const payload = normalizeCoachPayload(input);
  const draft = payload.user_draft.message.trim();
  const latest = payload.latest_incoming_message?.message.trim() || "";
  const otherName = payload.latest_incoming_message?.speaker_name || input.otherPartyName || input.botPersona?.name || "the other person";
  const lowerDraft = lc(draft);
  const lowerLatest = lc(latest);
  const topic = extractTopic(latest);
  const heatTrajectory = computeHeatTrajectory(payload.conversation_context);

  let heat = 12;
  let replyType: ReplyType = "direct_answer";
  let issueType: ReplyIssueType = "none";
  let verdict: ReplyVerdict = "good";

  if (APOLOGY_PATTERNS.some((pattern) => lowerDraft.includes(pattern))) {
    replyType = "apology";
    heat += 5;
  }
  if (lowerLatest.includes("why") || lowerLatest.includes("what do you mean")) {
    replyType = replyType === "apology" ? "apology" : "explanation";
    issueType = draft.length < 24 ? "too_vague" : "none";
  }
  if (/[!?]{2,}/.test(draft) || /[A-Z]{5,}/.test(draft) || HOT_PATTERNS.some((pattern) => lowerDraft.includes(pattern))) {
    heat += 42;
    issueType = "too_aggressive";
    verdict = "needs_improvement";
    replyType = "de_escalation";
  }
  if (draft.length > 220) {
    heat += 10;
    if (issueType === "none") issueType = "too_vague";
    verdict = "needs_improvement";
  }
  if (topic && draft.length < 18) {
    heat += 10;
    issueType = "too_vague";
    verdict = "needs_improvement";
  }
  if (heatTrajectory === "rising") heat += 10;

  heat = clamp(heat, 0, 100);
  const heatLabel = heatScoreToLabel(heat);
  const tryMessage = buildFallbackTryMessage(input, payload, replyType, issueType);
  const warningBadge = issueType === "none"
    ? null
    : issueType === "too_aggressive"
      ? "tone may escalate"
      : "needs more clarity";

  let aiReview = "This draft fits the moment.";
  let whyAppeared = "Routine check";
  if (topic && issueType === "too_aggressive") {
    aiReview = `${otherName} is pushing on "${topic}", so this wording answers with heat instead of explaining your point.`;
    whyAppeared = "High heat detected";
  } else if (topic && issueType === "too_vague") {
    aiReview = `${otherName} is asking about "${topic}", so the reply needs a clearer answer than this draft gives.`;
    whyAppeared = "Draft is too vague";
  } else if (topic) {
    aiReview = `${otherName} is focused on "${topic}", and this reply stays close enough to that point.`;
    whyAppeared = "Routine check";
  }

  const shouldIntervene = heat >= 35 || issueType !== "none";
  const interventionReason = shouldIntervene ? "High heat or active issue detected" : "Draft is safe and clear";

  return {
    should_intervene: shouldIntervene,
    intervention_reason: interventionReason,
    reply_type: replyType,
    verdict,
    heat_label: heatLabel,
    issue_type: issueType,
    ai_review: aiReview,
    why_appeared: whyAppeared,
    warning_badge: warningBadge,
    try_message: tryMessage,
    heat,
    category: categoryFrom(replyType, heatLabel, heat),
    softened: tryMessage,
    guidance: aiReview,
    risk_factors: warningBadge ? [warningBadge] : [],
    recommended_cooldown_seconds: heat >= 80 ? 30 : heat >= 50 ? 15 : 0,
    heat_trajectory: heatTrajectory,
    bot_context_hint: input.botPersona ? `${input.botPersona.name} responds to accountability, not deflection.` : "",
    other_party_state: input.conversationKind === "human" && topic ? `${otherName} seems focused on ${topic}.` : undefined,
  };
}

function buildCoachPrompt(input: ReplyAnalyzeRequest): string {
  const payload = normalizeCoachPayload(input);
  const userName = payload.user_draft.speaker_name || input.userName || "the user";
  const otherName = payload.latest_incoming_message?.speaker_name || input.otherPartyName || input.botPersona?.name || "the other person";
  const persona = input.botPersona
    ? {
        name: input.botPersona.name,
        role: input.botPersona.role,
        personality: input.botPersona.personality,
      }
    : null;

  return [
    "You are an AI message coach inside Stayhand's reply composer.",
    "Every draft is analyzed, but not every draft should interrupt the user.",
    "Your first job is to decide whether Stayhand should intervene before the message is sent.",
    "Only intervene when the draft would genuinely benefit from review.",
    "",
    "A message should be allowed to send directly when it is:",
    "- relevant to the latest incoming message",
    "- clear enough",
    "- calm or neutral in tone",
    "- not likely to escalate conflict",
    "- not missing an important question",
    "- not introducing unrelated context",
    "- not likely to cause regret",
    "",
    "A message should trigger review when it is:",
    "- unclear",
    "- too vague",
    "- emotionally risky",
    "- defensive",
    "- aggressive",
    "- dismissive",
    "- off-topic",
    "- missing the other person’s point",
    "- likely to escalate tension",
    "- likely to be regretted",
    "",
    "Use the structured payload below. Do not treat the conversation as an unlabeled transcript.",
    JSON.stringify(
      {
        user: userName,
        other_person: otherName,
        conversation_kind: input.conversationKind ?? "human",
        bot_persona: persona,
        user_behavior_summary: buildUserBehaviourSummary(payload.conversation_context),
        conversation_context: payload.conversation_context,
        latest_incoming_message: payload.latest_incoming_message,
        user_draft: payload.user_draft,
      },
      null,
      2
    ),
    "",
    "Instructions:",
    "1. Decide whether to intervene. Set should_intervene to false if the message is safe, direct, and calm. Set to true if it needs review.",
    "2. If should_intervene is false, verdict MUST be 'good', issue_type MUST be 'none', warning_badge, ai_review, try_message, and why_appeared MUST be null.",
    "3. Do not interrupt the user just to say the message is okay.",
    "4. The Try message must be a clearly improved version of the user's draft. It must not simply repeat the draft.",
    "5. If the draft is vague (e.g. 'what do you mean'), the Try must be a specific question grounded in the latest incoming message.",
    "6. Do not invent facts, excuses, reasons, or background NOT present in the conversation.",
    "7. Infer reply_type from the conversation. Do not default to apology.",
    "8. If Try is a question, reply_type must be 'question' or 'clarification' — NOT 'direct_answer'.",
    "9. The AI Review must name the actual issue in THIS conversation. Avoid all generic text.",
    "10. NEVER use these phrases: 'raised something specific', 'make sure your reply directly addresses', 'what they actually said'.",
    "11. Before returning, internally verify consistency: Does try_message respond to latest_incoming_message? Is try_message better than user_draft? If should_intervene is false, are all text fields null?",
    "",
    "Return ONLY valid JSON with this exact shape:",
    JSON.stringify({
      should_intervene: true,
      intervention_reason: "One short reason explaining the decision.",
      reply_type: "apology | clarification | disagreement | explanation | question | reassurance | boundary_setting | de_escalation | casual_reply | correction | empathy | direct_answer | other",
      verdict: "good | needs_improvement",
      heat: "calm | rising | tense",
      risk_score: 0,
      issue_type: "none | off_topic | too_aggressive | too_vague | misses_question | missing_empathy | unclear | contradicts_context",
      ai_review: `If should_intervene is true, write one specific sentence. If false, write null.`,
      why_appeared: "If should_intervene is true, short reason. If false, null.",
      warning_badge: null,
      try_message: "If should_intervene is true, improved draft. If false, null.",
      risk_factors: [],
      recommended_cooldown_seconds: 0,
      bot_context_hint: persona ? `One short phrase about how ${otherName} responds.` : undefined,
      other_party_state: persona ? undefined : `One short sentence about what ${otherName} is feeling and what they need.`,
    }),
  ].join("\n");
}

function parseReplyType(value: unknown, fallback: ReplyType): ReplyType {
  return typeof value === "string" && REPLY_TYPES.includes(value as ReplyType) ? value as ReplyType : fallback;
}

function parseVerdict(value: unknown, fallback: ReplyVerdict): ReplyVerdict {
  return value === "good" || value === "needs_improvement" ? value : fallback;
}

function parseHeatLabel(value: unknown, fallback: ReplyHeatLabel): ReplyHeatLabel {
  return value === "calm" || value === "rising" || value === "tense" ? value : fallback;
}

function parseIssueType(value: unknown, fallback: ReplyIssueType): ReplyIssueType {
  return typeof value === "string" && ISSUE_TYPES.includes(value as ReplyIssueType) ? value as ReplyIssueType : fallback;
}

function normalizeCoachResponse(input: ReplyAnalyzeRequest, parsed: RawCoachResponse, fallback: ReplyAnalyzeResult): ReplyAnalyzeResult {
  const replyType = parseReplyType(parsed.reply_type, fallback.reply_type);
  const verdict = parseVerdict(parsed.verdict, fallback.verdict);
  const heatLabel = parseHeatLabel(parsed.heat, fallback.heat_label);
  const heat = clamp(
    typeof parsed.risk_score === "number"
      ? parsed.risk_score
      : typeof parsed.heat === "number"
        ? parsed.heat
        : labelToHeatScore(heatLabel),
    0,
    100
  );
  const issueType = parseIssueType(parsed.issue_type, fallback.issue_type);
  const aiReview = typeof parsed.ai_review === "string" && parsed.ai_review.trim()
    ? parsed.ai_review.trim()
    : fallback.ai_review;
  const whyAppeared = typeof parsed.why_appeared === "string" && parsed.why_appeared.trim()
    ? parsed.why_appeared.trim()
    : fallback.why_appeared;
  const tryMessage = typeof parsed.try_message === "string" && parsed.try_message.trim()
    ? parsed.try_message.trim()
    : fallback.try_message;
  const warningBadge = typeof parsed.warning_badge === "string" && parsed.warning_badge.trim()
    ? parsed.warning_badge.trim()
    : null;
  const riskFactors = Array.isArray(parsed.risk_factors)
    ? parsed.risk_factors.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 3)
    : fallback.risk_factors;

  const shouldIntervene = typeof parsed.should_intervene === "boolean" ? parsed.should_intervene : fallback.should_intervene;
  const interventionReason = typeof parsed.intervention_reason === "string" ? parsed.intervention_reason : fallback.intervention_reason;

  const normalized = reconcileCoachLabels({
    should_intervene: shouldIntervene,
    intervention_reason: interventionReason,
    reply_type: replyType,
    verdict,
    heat_label: heatLabel,
    issue_type: issueType,
    ai_review: aiReview,
    why_appeared: whyAppeared,
    warning_badge: warningBadge,
    try_message: tryMessage,
    heat,
    category: categoryFrom(replyType, heatLabel, heat),
    softened: tryMessage,
    guidance: aiReview,
    risk_factors: riskFactors,
    recommended_cooldown_seconds: clamp(
      typeof parsed.recommended_cooldown_seconds === "number"
        ? parsed.recommended_cooldown_seconds
        : fallback.recommended_cooldown_seconds,
      0,
      45
    ),
    heat_trajectory: computeHeatTrajectory(normalizeCoachPayload(input).conversation_context),
    bot_context_hint: typeof parsed.bot_context_hint === "string" ? parsed.bot_context_hint.trim() : fallback.bot_context_hint,
    other_party_state: typeof parsed.other_party_state === "string" ? parsed.other_party_state.trim() : fallback.other_party_state,
  });
  return normalized;
}

function validateCoachResult(input: ReplyAnalyzeRequest, result: ReplyAnalyzeResult): string[] {
  const payload = normalizeCoachPayload(input);
  const errors: string[] = [];
  
  if (!result.should_intervene) {
    if (result.issue_type !== "none") errors.push("issue_type must be none if should_intervene is false");
    if (result.verdict !== "good") errors.push("verdict must be good if should_intervene is false");
    return errors;
  }

  const latest = payload.latest_incoming_message?.message ?? "";
  const draft = payload.user_draft.message;
  const tryMessage = result.try_message;
  const review = lc(result.ai_review);

  // Reject if Try is meaninglessly similar to draft for quality-sensitive issue types
  const qualityIssues: ReplyIssueType[] = ["too_vague", "misses_question", "unclear", "contradicts_context"];
  if (qualityIssues.includes(result.issue_type) && !isMeaningfulRewrite(draft, tryMessage, result.issue_type)) {
    errors.push(`try_message is not a meaningful improvement over the draft for issue_type '${result.issue_type}'`);
  }
  // Reject if Try literally equals draft (always)
  if (tryMessage.trim().toLowerCase() === draft.trim().toLowerCase()) {
    errors.push("try_message is identical to the user draft");
  }
  if (!tryMessage.trim()) errors.push("try_message is empty");
  if (BANNED_REVIEW_PHRASES.some((phrase) => review.includes(phrase))) {
    errors.push("ai_review uses banned generic review text");
  }
  if (result.verdict === "good" && result.issue_type !== "none") {
    errors.push("verdict good contradicts a non-none issue_type");
  }
  if (result.verdict === "needs_improvement" && result.issue_type === "none") {
    errors.push("verdict needs_improvement contradicts issue_type none");
  }
  if (result.verdict === "good" && /\b(escalate|misses|ignores|dismissive|aggressive|unclear|vague|contradict)/i.test(result.ai_review)) {
    errors.push("verdict good contradicts ai_review");
  }
  if (result.warning_badge && result.verdict === "good" && result.heat_label === "calm") {
    errors.push("warning_badge contradicts calm good verdict");
  }

  const latestWords = contentWords(latest);
  const draftWords = contentWords(draft);
  const tryWords = contentWords(tryMessage);
  const sharesLatest = latestWords.length === 0 || tryWords.some((word) => latestWords.includes(word));
  const sharesDraft = draftWords.length === 0 || tryWords.some((word) => draftWords.includes(word));

  if (!sharesLatest && !sharesDraft) {
    errors.push("try_message does not appear based on latest_incoming_message or user_draft");
  }
  if (/\bwhy\b/i.test(latest) && !/\b(because|mean|meant|reason|thought|changed|sorry|explain|clear|clarify)\b/i.test(tryMessage)) {
    errors.push("try_message does not answer the latest why-question");
  }
  if (result.reply_type === "question" && !tryMessage.includes("?")) {
    errors.push("reply_type question does not match try_message");
  }
  if (result.reply_type === "apology" && !/\b(sorry|apologize|my fault|on me|should have)\b/i.test(tryMessage)) {
    errors.push("reply_type apology does not match try_message");
  }
  if (result.reply_type === "boundary_setting" && !/\b(can't|cannot|not okay|need|won't|do not|don't)\b/i.test(tryMessage)) {
    errors.push("reply_type boundary_setting does not match try_message");
  }

  const combinedSource = lc(`${latest} ${draft} ${payload.conversation_context.map((message) => message.message).join(" ")}`);
  const suspiciousNewFacts = ["traffic", "hospital", "family emergency", "my phone died", "at work", "tomorrow morning", "next week", "money", "loan"];
  for (const fact of suspiciousNewFacts) {
    if (lc(tryMessage).includes(fact) && !combinedSource.includes(fact)) {
      errors.push(`try_message introduces unrelated fact: ${fact}`);
      break;
    }
  }

  if (!isMeaningfulRewrite(draft, tryMessage, result.issue_type)) {
    errors.push("try_message is not a meaningful rewrite of the user draft");
  }

  return errors;
}

export async function analyzeReplyDraft(input: ReplyAnalyzeRequest): Promise<{
  result: ReplyAnalyzeResult;
  live: boolean;
  model: string | null;
}> {
  const payload = normalizeCoachPayload(input);
  if (!payload.user_draft.message.trim()) {
    return { result: buildFallbackAnalysis(input), live: false, model: null };
  }

  const fallback = buildFallbackAnalysis(input);
  const basePrompt = buildCoachPrompt(input);
  let prompt = basePrompt;
  let lastModel: string | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { parsed, model } = await generateJson<RawCoachResponse>({
        prompt,
        temperature: attempt === 0 ? 0.25 : 0.15,
        timeoutMs: 12000,
      });
      lastModel = model;
      const result = reconcileCoachLabels(normalizeCoachResponse(input, parsed, fallback));
      const validationErrors = validateCoachResult(input, result);
      if (!validationErrors.length) {
        return { result, live: true, model };
      }
      prompt = [
        basePrompt,
        "",
        "Your previous JSON failed validation:",
        validationErrors.map((error) => `- ${error}`).join("\n"),
        "Regenerate the full JSON response. Do not add explanation.",
      ].join("\n");
    } catch {
      break;
    }
  }

  return { result: reconcileCoachLabels(fallback), live: false, model: lastModel };
}
