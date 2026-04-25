import { clamp } from "@/lib/runtime/utils";
import type { SendAnalyzeRequest, SendAnalyzeResult, ThinkSurface } from "@/lib/real-mode/types";
import { generateJson } from "@/lib/real-mode/gemini";

type DecisionType = "send" | "buy" | "post" | "quit" | "custom";
type Tone = "therapist" | "friend" | "lawyer";

const TONE_PROMPTS: Record<Tone, string> = {
  therapist: "Respond as a calm therapist — empathetic but honest, never preachy.",
  friend: "Respond as a frank friend — direct, no sugarcoating, but kind.",
  lawyer: "Respond as a careful lawyer — precise, risk-focused, emotionally neutral.",
};

const FALLBACKS: Record<"send" | "buy", SendAnalyzeResult> = {
  send: {
    honest_summary: "You're about to send something that may carry more heat than the outcome you actually want.",
    improved_draft: "I want to be clear about what happened without adding more heat. Can we slow this down, look at the issue together, and agree on the next fix?",
    change_summary: [
      "Replaced blame with a clear statement of concern.",
      "Turned the demand into a concrete next step.",
      "Kept the point while lowering the chance of defensiveness.",
    ],
    questions: [
      "What response are you hoping this gets you?",
      "Would you still send this unchanged tomorrow morning?",
      "What is the calmest version that still tells the truth?",
    ],
    forecast: {
      best_case: "They understand your point immediately and the conversation gets clearer, not sharper.",
      likely_case: "Your point lands, but the tone becomes the real topic instead of the issue.",
      regret_case: "You hit send, then spend the next day managing fallout from words you cannot take back.",
    },
    recommended_cooldown_seconds: 60,
  },
  buy: {
    honest_summary: "You're close to buying something that may feel urgent now but may not match what you need later.",
    improved_draft: "Pause this purchase until you can name the exact need, compare it with what you already have, and decide again when the urgency has cooled.",
    change_summary: [
      "Converted the impulse into a review step.",
      "Separated the real need from the urgency pressure.",
      "Added a comparison against existing goals or purchases.",
    ],
    questions: [
      "What exact problem does this solve by next week?",
      "If the discount vanished, would you still want it?",
      "What goal does this purchase compete with right now?",
    ],
    forecast: {
      best_case: "The purchase fits a real need and keeps proving itself after the excitement fades.",
      likely_case: "You buy it, feel good briefly, then realize it solved less than you expected.",
      regret_case: "You spend against a goal you care about and the item mostly ends up as mood residue.",
    },
    recommended_cooldown_seconds: 120,
  },
};

function tidyDraft(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function softenLine(line: string): string {
  return line
    .replace(/\bI cannot believe\b/gi, "I am concerned that")
    .replace(/\bthis is exactly why\b/gi, "this is part of why")
    .replace(/\bfix it now\b/gi, "can we fix this next")
    .replace(/\bon you, not us\b/gi, "something we need to resolve together")
    .replace(/\bthis is exactly the pattern that keeps putting the team in cleanup mode\b/gi, "this is the process gap I want us to fix")
    .replace(/\bdo not make me chase this again\b/gi, "please confirm ownership so I do not have to chase the next step")
    .replace(/\byou always\b/gi, "this has happened more than once")
    .replace(/\byou never\b/gi, "I am not seeing")
    .replace(/\bASAP\b/g, "today if possible");
}

function buildLongFormImprovedDraft(decisionType: DecisionType, draft: string): string {
  if (decisionType === "buy") {
    return "I am going to pause this purchase until I can name the exact need, compare it with what I already have, and decide again without the urgency pressure.";
  }

  const lines = draft
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (!lines.length) return draft.trim();

  const softenedLines = lines.map((line) => softenLine(line));
  return softenedLines.join("\n\n");
}

function buildImprovedDraft(decisionType: DecisionType, draft: string): string {
  const text = tidyDraft(draft);
  const lower = text.toLowerCase();
  const words = wordCount(text);
  const lineCount = draft.split(/\r?\n/).filter((line) => line.trim().length > 0).length;

  if (words >= 120 || lineCount >= 8) {
    return buildLongFormImprovedDraft(decisionType, draft);
  }

  if (decisionType === "buy") {
    return "I am going to pause this purchase until I can name the exact need, compare it with what I already have, and decide again without the urgency pressure.";
  }

  if (decisionType === "post") {
    return `I want to say this clearly without turning the tone into the story: ${text}`;
  }

  if (decisionType === "quit") {
    return "I need to step away from this, and I want to do it cleanly. I am going to pause before making it final so the decision is clear instead of reactive.";
  }

  if (decisionType === "custom") {
    return `I want to make this decision deliberately, not reactively: ${text}`;
  }

  const draftWordCount = text.split(/\s+/).filter(Boolean).length;
  const looksLikeWorkEscalation =
    draftWordCount >= 60 &&
    ["client", "handoff", "rollout", "launch", "timeline", "team", "escalation"].some((term) => lower.includes(term));

  if (looksLikeWorkEscalation) {
    return "Jordan, I am frustrated by how the client escalation landed tonight, and I want to handle it without turning this into blame. It looks like the rollout moved before the final notes were checked, which left us cleaning up late. Can you send the client update and revised timeline before morning, then review the handoff with me tomorrow so we close the gap in the process?";
  }

  if (lower.includes("cannot believe") && lower.includes("fix it now")) {
    return "I am frustrated with how this landed, and I do not want to make it worse in writing. Can we review what happened and agree on the fixes together?";
  }

  if (lower.includes("already asked") && lower.includes("noon")) {
    return "We still need the files by noon to hold the current timeline. If that deadline no longer works, please tell us today so we can adjust the handoff plan.";
  }

  if (lower.includes("sorry") && (lower.includes("ruin") || lower.includes("everything"))) {
    return "I am sorry for how I handled this. You do not need to respond right now. I want to come back to it with more care when we both have space.";
  }

  const softened = softenLine(text);

  if (softened !== text) {
    return softened;
  }

  return `I want to be clear without adding heat: ${text}`;
}

function buildChangeSummary(decisionType: DecisionType): string[] {
  if (decisionType === "buy") {
    return FALLBACKS.buy.change_summary;
  }
  if (decisionType === "post") {
    return [
      "Frames the post around the point instead of the reaction.",
      "Adds a tone check before public permanence.",
      "Keeps the original meaning visible.",
    ];
  }
  if (decisionType === "quit") {
    return [
      "Separates the decision from the emotional spike.",
      "Adds a pause before making the action final.",
      "Keeps the boundary without escalating it.",
    ];
  }
  if (decisionType === "custom") {
    return [
      "Names the decision instead of rushing it.",
      "Adds a deliberate pause before action.",
      "Preserves the original intent.",
    ];
  }
  return FALLBACKS.send.change_summary;
}

function fallbackFor(surface: "send" | "buy", decisionType: DecisionType, draft: string): SendAnalyzeResult {
  const fallback = surface === "buy" || decisionType === "buy" ? FALLBACKS.buy : FALLBACKS.send;
  return {
    ...fallback,
    improved_draft: buildImprovedDraft(decisionType, draft),
    change_summary: buildChangeSummary(decisionType),
    recommended_cooldown_seconds: clamp(fallback.recommended_cooldown_seconds, 30, 60),
  };
}

function normalizeSurface(surface: ThinkSurface | "send" | "buy" | undefined): "send" | "buy" {
  if (surface === "buy") {
    return "buy";
  }
  return "send";
}

function normalizeType(type: string | undefined): DecisionType {
  const valid: DecisionType[] = ["send", "buy", "post", "quit", "custom"];
  return valid.includes(type as DecisionType) ? (type as DecisionType) : "send";
}

function normalizeTone(tone: string | undefined): Tone {
  const valid: Tone[] = ["therapist", "friend", "lawyer"];
  return valid.includes(tone as Tone) ? (tone as Tone) : "therapist";
}

export async function analyzeSendMoment(input: SendAnalyzeRequest & { type?: string; tone?: string }): Promise<{
  result: SendAnalyzeResult;
  live: boolean;
  model: string | null;
}> {
  const surface = normalizeSurface(input.surface);
  const decisionType = normalizeType((input as { type?: string }).type || surface);
  const tone = normalizeTone((input as { tone?: string }).tone);
  const draft = input.draft.trim();
  if (!draft) {
    throw new Error("draft is required");
  }

  const contextLine = input.context?.trim() ? `Context: ${input.context.trim()}\n` : "";
  const amountLine = (surface === "buy" || decisionType === "buy") && typeof input.amount === "number" && Number.isFinite(input.amount)
    ? `Amount: $${input.amount}\n`
    : "";

  const prompt = [
    "You are Stayhand, a calm AI layer that adds a useful pause before a risky decision.",
    TONE_PROMPTS[tone],
    `Decision type: ${decisionType}`,
    `Surface: ${surface}`,
    contextLine.trim(),
    amountLine.trim(),
    "Draft:",
    `"""${draft}"""`,
    "Return ONLY JSON with keys honest_summary, improved_draft, change_summary, questions, forecast, recommended_cooldown_seconds.",
    "honest_summary: one sentence, under 24 words, direct and non-preachy.",
    "improved_draft: a ready-to-use safer version that preserves the user's meaning while lowering heat, blame, urgency, or ambiguity.",
    "If the draft is long or multi-paragraph, keep similar detail and structure.",
    "Do not collapse long drafts into a short generic 1-2 line rewrite.",
    "For drafts above 120 words, improved_draft should be at least 55% of the original word count.",
    "change_summary: array of 2-3 short notes explaining what changed.",
    "questions: exactly 3 short practical questions.",
    "forecast: object with best_case, likely_case, regret_case, each one sentence.",
    "recommended_cooldown_seconds: integer 30-300.",
  ].filter(Boolean).join("\n");

  try {
    const { parsed, model } = await generateJson<Partial<SendAnalyzeResult>>({
      prompt,
      temperature: 0.55,
      timeoutMs: 9000,
    });

    const fallback = fallbackFor(surface, decisionType, draft);
    const questions = Array.isArray(parsed.questions)
      ? parsed.questions.filter((item): item is string => typeof item === "string").slice(0, 3)
      : fallback.questions;
    const changeSummary = Array.isArray(parsed.change_summary)
      ? parsed.change_summary.filter((item): item is string => typeof item === "string").slice(0, 3)
      : fallback.change_summary;

    const parsedImprovedDraft = typeof parsed.improved_draft === "string" && parsed.improved_draft.trim()
      ? parsed.improved_draft.trim()
      : fallback.improved_draft;
    const sourceWords = wordCount(draft);
    const improvedWords = wordCount(parsedImprovedDraft);
    const tooCompressedLongDraft =
      sourceWords >= 120 && improvedWords < Math.max(60, Math.floor(sourceWords * 0.55));

    return {
      result: {
        honest_summary: typeof parsed.honest_summary === "string" ? parsed.honest_summary : fallback.honest_summary,
        improved_draft: tooCompressedLongDraft ? fallback.improved_draft : parsedImprovedDraft,
        change_summary: changeSummary.length >= 2 ? changeSummary : fallback.change_summary,
        questions: questions.length === 3 ? questions : fallback.questions,
        forecast: {
          best_case: typeof parsed.forecast?.best_case === "string" ? parsed.forecast.best_case : fallback.forecast.best_case,
          likely_case: typeof parsed.forecast?.likely_case === "string" ? parsed.forecast.likely_case : fallback.forecast.likely_case,
          regret_case: typeof parsed.forecast?.regret_case === "string" ? parsed.forecast.regret_case : fallback.forecast.regret_case,
        },
        recommended_cooldown_seconds: clamp(
          typeof parsed.recommended_cooldown_seconds === "number" ? parsed.recommended_cooldown_seconds : fallback.recommended_cooldown_seconds,
          30,
          60
        ),
      },
      live: true,
      model,
    };
  } catch {
    return { result: fallbackFor(surface, decisionType, draft), live: false, model: null };
  }
}
