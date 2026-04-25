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
  reply_type?: unknown;
  verdict?: unknown;
  heat?: unknown;
  risk_score?: unknown;
  issue_type?: unknown;
  ai_review?: unknown;
  warning_badge?: unknown;
  try_message?: unknown;
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

function buildFallbackTryMessage(input: ReplyAnalyzeRequest, payload: CoachPayload, replyType: ReplyType): string {
  const draft = payload.user_draft.message.trim();
  const latest = payload.latest_incoming_message?.message.trim() || "";
  const lowerDraft = lc(draft);
  const lowerLatest = lc(latest);
  const otherName = payload.latest_incoming_message?.speaker_name || input.otherPartyName || input.botPersona?.name || "you";

  if (!draft) return "";

  if (replyType === "apology" || APOLOGY_PATTERNS.some((pattern) => lowerDraft.includes(pattern))) {
    if (lowerLatest.includes("why") || lowerLatest.includes("what do you mean")) {
      return `I'm sorry, ${otherName}. I didn't mean to dismiss it, and I should explain why I changed my mind instead of turning this into a fight.`;
    }
    return `I'm sorry. I didn't mean for it to land that way, and I want to handle this better.`;
  }

  if (lowerLatest.includes("why") || lowerLatest.includes("what do you mean")) {
    return `I get why that sounds confusing. What I meant was that the idea feels different to me now, and I should have explained that more clearly.`;
  }

  if (lowerDraft.startsWith("no") || lowerDraft.includes("not doing")) {
    return `I can't agree to that as-is, but I want to be clear about why instead of shutting the conversation down.`;
  }

  if (HOT_PATTERNS.some((pattern) => lowerDraft.includes(pattern))) {
    return draft
      .replace(/\byou always\b/gi, "this keeps happening")
      .replace(/\byou never\b/gi, "this still isn't happening")
      .replace(/\bi can't believe\b/gi, "I'm frustrated that")
      .replace(/\byou don't care\b/gi, "it feels like this isn't landing");
  }

  return draft;
}

function buildFallbackAnalysis(input: ReplyAnalyzeRequest): ReplyAnalyzeResult {
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
  const tryMessage = buildFallbackTryMessage(input, payload, replyType);
  const warningBadge = issueType === "none"
    ? null
    : issueType === "too_aggressive"
      ? "tone may escalate"
      : "needs more clarity";

  let aiReview = "This draft fits the moment.";
  if (topic && issueType === "too_aggressive") {
    aiReview = `${otherName} is pushing on "${topic}", so this wording answers with heat instead of explaining your point.`;
  } else if (topic && issueType === "too_vague") {
    aiReview = `${otherName} is asking about "${topic}", so the reply needs a clearer answer than this draft gives.`;
  } else if (topic) {
    aiReview = `${otherName} is focused on "${topic}", and this reply stays close enough to that point.`;
  }

  return {
    reply_type: replyType,
    verdict,
    heat_label: heatLabel,
    issue_type: issueType,
    ai_review: aiReview,
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
    "Review the signed-in user's draft before they send it.",
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
    "1. Infer the reply_type from the conversation. Do not default to apology, softening, or a question.",
    "2. The Try message must be a better version of the user's draft, not a new topic.",
    "3. Do not invent facts, excuses, reasons, arguments, promises, or background not present in the payload.",
    "4. If the conversation is tense, reduce friction without erasing the user's point.",
    "5. Do not make the user overly apologetic unless the context clearly calls for an apology.",
    "6. The AI Review must name the actual issue in this conversation. Avoid generic coaching text.",
    "7. Never use these phrases or close variations: 'raised something specific', 'make sure your reply directly addresses what they said', 'may not address what they actually said'.",
    "8. The warning_badge, heat label, reply_type, ai_review, verdict, issue_type, and try_message must agree with each other.",
    "9. risk_score is a 0-100 app meter that must agree with heat: calm is usually 0-34, rising is usually 35-69, tense is usually 70-100.",
    "",
    "Return ONLY valid JSON with this exact shape:",
    JSON.stringify({
      reply_type: "apology | clarification | disagreement | explanation | question | reassurance | boundary_setting | de_escalation | casual_reply | correction | empathy | direct_answer | other",
      verdict: "good | needs_improvement",
      heat: "calm | rising | tense",
      risk_score: 0,
      issue_type: "none | off_topic | too_aggressive | too_vague | misses_question | missing_empathy | unclear | contradicts_context",
      ai_review: `One specific sentence about what ${otherName} is asking or feeling and whether the draft handles it.`,
      warning_badge: null,
      try_message: "One short natural text the user could send.",
      risk_factors: [],
      recommended_cooldown_seconds: 0,
      bot_context_hint: persona ? `One short phrase about how ${otherName} tends to respond.` : undefined,
      other_party_state: persona ? undefined : `One short sentence about what ${otherName} seems to need.`,
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
  const tryMessage = typeof parsed.try_message === "string" && parsed.try_message.trim()
    ? parsed.try_message.trim()
    : fallback.try_message;
  const warningBadge = typeof parsed.warning_badge === "string" && parsed.warning_badge.trim()
    ? parsed.warning_badge.trim()
    : null;
  const riskFactors = Array.isArray(parsed.risk_factors)
    ? parsed.risk_factors.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 3)
    : fallback.risk_factors;

  return {
    reply_type: replyType,
    verdict,
    heat_label: heatLabel,
    issue_type: issueType,
    ai_review: aiReview,
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
  };
}

function validateCoachResult(input: ReplyAnalyzeRequest, result: ReplyAnalyzeResult): string[] {
  const payload = normalizeCoachPayload(input);
  const errors: string[] = [];
  const latest = payload.latest_incoming_message?.message ?? "";
  const draft = payload.user_draft.message;
  const tryMessage = result.try_message;
  const review = lc(result.ai_review);

  if (!result.ai_review.trim()) errors.push("ai_review is empty");
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
        timeoutMs: 10000,
      });
      lastModel = model;
      const result = normalizeCoachResponse(input, parsed, fallback);
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

  return { result: fallback, live: false, model: lastModel };
}
