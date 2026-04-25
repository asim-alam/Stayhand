export type RealModeSurface = "send" | "buy" | "reply";

export type ThinkSurface = "send" | "buy" | "post" | "quit" | "custom";

export interface SendAnalyzeRequest {
  surface: "send" | "buy";
  draft: string;
  context?: string;
  amount?: number;
}

export interface SendAnalyzeResult {
  honest_summary: string;
  improved_draft: string;
  change_summary: string[];
  questions: string[];
  forecast: {
    best_case: string;
    likely_case: string;
    regret_case: string;
  };
  recommended_cooldown_seconds: number;
}

export type ReplyCategory = "neutral" | "charged" | "apology";

export type ReplySpeakerType = "user" | "other_person";

export type ReplyType =
  | "apology"
  | "clarification"
  | "disagreement"
  | "explanation"
  | "question"
  | "reassurance"
  | "boundary_setting"
  | "de_escalation"
  | "casual_reply"
  | "correction"
  | "empathy"
  | "direct_answer"
  | "other";

export type ReplyVerdict = "good" | "needs_improvement";

export type ReplyHeatLabel = "calm" | "rising" | "tense";

export type ReplyIssueType =
  | "none"
  | "off_topic"
  | "too_aggressive"
  | "too_vague"
  | "misses_question"
  | "missing_empathy"
  | "unclear"
  | "contradicts_context";

export interface ReplyCoachMessage {
  speaker_type: ReplySpeakerType;
  speaker_name: string;
  message: string;
  timestamp?: string;
  heat?: number;
}

/** A single message in the conversation thread passed to the AI. */
export interface ThreadMessage {
  senderName: string;
  senderType: "user" | "bot" | "human";
  body: string;
  /** Heat score from friction metadata, if known (from a previous analysis). */
  heat?: number;
}

/** Predefined bot persona metadata injected into the AI prompt. */
export interface BotPersona {
  name: string;
  role: string;
  personality: string;
}

export interface ReplyAnalyzeRequest {
  incomingMessage?: string;
  draft: string;
  context?: string;
  channel?: string;
  audience?: string;
  /** Last 10 messages from the conversation, ordered oldest → newest. */
  thread?: ThreadMessage[];
  conversationContext?: ReplyCoachMessage[];
  latestIncomingMessage?: ReplyCoachMessage;
  userDraft?: ReplyCoachMessage;
  /** Present only for bot conversations. */
  botPersona?: BotPersona;
  /** Whether this is a bot or human-to-human conversation. */
  conversationKind?: "bot" | "human";
  /** Display name of the other party in a human conversation. */
  otherPartyName?: string;
  /** Display name of the user composing the reply. */
  userName?: string;
}

export interface ReplyAnalyzeResult {
  reply_type: ReplyType;
  verdict: ReplyVerdict;
  heat_label: ReplyHeatLabel;
  issue_type: ReplyIssueType;
  ai_review: string;
  warning_badge: string | null;
  try_message: string;
  heat: number;
  category: ReplyCategory;
  softened: string;
  guidance: string;
  risk_factors: string[];
  recommended_cooldown_seconds: number;
  /** Direction of heat across the last 10 messages. */
  heat_trajectory: "rising" | "falling" | "stable";
  /** For bot conversations: a one-liner on how the bot tends to respond. */
  bot_context_hint: string;
  /** For human conversations: a plain-English read of what the other party seems to be feeling. */
  other_party_state?: string;
}

export interface BuyProduct {
  title: string;
  image: string | null;
  price: string | null;
  store: string;
  url: string;
}

export interface BuyIntakeResult {
  product: BuyProduct;
  needsManualDetails: boolean;
  scrapeFailed: boolean;
}

export interface BuyQuestionMessage {
  role: "assistant" | "user";
  content: string;
}

export interface BuyQuestionResult {
  question: string;
}

export type BuyVerdict = "BUY" | "WAIT_24H" | "DONT";

export interface BuyVerdictResult {
  verdict: BuyVerdict;
  reasoning: string;
  underlying_need: string;
  cheaper_alternative: string;
  urgency_score: number;
}
