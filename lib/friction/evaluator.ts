import type {
  FrictionEvent,
  FrictionMode,
  InterventionDecision,
  LedgerEntry,
  RecommendedAction,
} from "@/lib/types/runtime";
import { clamp, createId, nowIso } from "@/lib/runtime/utils";

function getActions(mode: FrictionMode, tier: InterventionDecision["tier"], event: FrictionEvent): RecommendedAction[] {
  const common = {
    shield: [
      { id: "hold", label: "Hold and verify", reason: "Pause the transfer and verify the recipient independently.", primary: true },
      { id: "block", label: "Block transfer", reason: "Use when identity confidence is weak or urgency is manipulative." },
      { id: "release", label: "Release after review", reason: "Only after trust and amount checks clear." },
    ],
    kiln: [
      { id: "soften", label: "Send softened version", reason: "Preserve intent while reducing escalation.", primary: true },
      { id: "hold", label: "Move to cooling drawer", reason: "Use when heat is high and the message should age first." },
      { id: "release", label: "Release after cooldown", reason: "Use only after the heat signal falls." },
    ],
    quarry: [
      { id: "interrogate", label: "Interrogate intent", reason: "Ask sharper questions before drafting.", primary: true },
      { id: "hold", label: "Hold draft", reason: "Prevent generic output until the ask becomes specific." },
      { id: "release", label: "Release after contrast review", reason: "Only after distinct directions exist." },
    ],
    lab: [
      { id: "prescribe", label: "Issue prescription", reason: "Treat the behavior pattern, not the one-off click.", primary: true },
      { id: "hold", label: "Queue deeper scan", reason: "Collect more pattern evidence before acting." },
      { id: "release", label: "Clear without intervention", reason: "Use when recent behavior has already stabilized." },
    ],
  } satisfies Record<FrictionMode, RecommendedAction[]>;

  return common[mode].map((action) => ({
    ...action,
    primary: action.primary ?? (tier >= 2 && action.id !== "release"),
    reason: action.id === "hold" && mode === "kiln" && tier >= 3
      ? `${action.reason} This event is severe enough for a visible cooldown.`
      : action.reason,
  }));
}

export function evaluateEvent(event: FrictionEvent): InterventionDecision {
  let mode: FrictionMode = "lab";
  let score = 18;
  const reasons: string[] = [];

  if (event.domain === "finance") {
    mode = "shield";
    score += 46;
    reasons.push("Money movement can become irreversible very quickly.");
    if (Number(event.amount || 0) >= 1000) {
      score += 18;
      reasons.push("The amount exceeds the trust threshold.");
    }
    if (event.tags.includes("new-recipient") || event.tags.includes("spoof-risk")) {
      score += 14;
      reasons.push("Identity confidence is weak.");
    }
  }

  if (event.domain === "communications") {
    mode = "kiln";
    score += 30;
    reasons.push("The message can do social damage before intent is understood.");
    if (event.sentiment >= 70) {
      score += 20;
      reasons.push("Heat is high enough to distort the point.");
    }
    if (event.tags.includes("public-channel") || event.tags.includes("manager-visible")) {
      score += 10;
      reasons.push("The audience size increases the cost of a mistake.");
    }
    if (event.tags.includes("apology")) {
      score = 12;
      reasons.push("This is an apology; fast-lane sending is usually safer than delay.");
    }
  }

  if (event.domain === "creative") {
    mode = "quarry";
    score += 28;
    reasons.push("The brief is too thin for trustworthy output.");
    if (event.tags.includes("slop-risk")) {
      score += 18;
      reasons.push("The request pattern will likely create generic output.");
    }
  }

  if (event.domain === "habit") {
    mode = "lab";
    score += 26;
    reasons.push("The signal looks like a behavioral pattern, not a single bad click.");
    if (event.tags.includes("autopilot")) {
      score += 14;
      reasons.push("The pattern suggests convenience is steering decisions.");
    }
    if (event.tags.includes("fatigue")) {
      score += 8;
      reasons.push("Fatigue lowers the quality of fast decisions.");
    }
  }

  score += Math.round(event.urgency * 0.2);
  const bounded = clamp(score, 0, 100);
  const tier = bounded >= 85 ? 3 : bounded >= 65 ? 2 : bounded >= 35 ? 1 : 0;
  const lane = event.tags.includes("apology") ? "green" : tier >= 2 ? "intervention" : "advisory";

  const headlineMap: Record<FrictionMode, string> = {
    shield: tier >= 2
      ? "Money movement should be slowed before trust is verified."
      : "This financial action needs review before it becomes irreversible.",
    kiln: event.tags.includes("apology")
      ? "The apology can move through the fast lane."
      : tier >= 2
        ? "Heat is high enough that sending now will likely harden the conflict."
        : "Tone should be reviewed before release.",
    quarry: "The ask is under-shaped; questions should come before polish.",
    lab: "This pattern wants a prescription, not a warning.",
  };

  const recommendationMap: Record<FrictionMode, string> = {
    shield: "Pause the action, verify the recipient out of band, and offer the safest next path.",
    kiln: "Run the message through a cooling step or softened rewrite before anyone sees it.",
    quarry: "Refuse instant polish, ask sharper questions, and force contrasting outputs.",
    lab: "Treat the signal as drift in a system and prescribe friction for the pattern.",
  };

  return {
    mode,
    tier,
    lane,
    reasons,
    headline: headlineMap[mode],
    recommendation: recommendationMap[mode],
    recommendedActions: getActions(mode, tier, event),
    score: bounded,
  };
}

export function buildLedgerEntry(event: FrictionEvent, action: string): LedgerEntry {
  const evaluation = event.evaluation;
  return {
    id: createId("log"),
    ts: nowIso(),
    sourceId: event.sourceId,
    mode: evaluation.mode,
    action,
    summary: buildLedgerSummary(event, action),
    saved: evaluation.mode === "shield" && (action === "hold" || action === "block") ? Number(event.amount || 0) : undefined,
    heat: evaluation.mode === "kiln" ? evaluation.score : undefined,
    quotient: evaluation.mode === "lab" ? clamp(100 - evaluation.score + 12, 28, 100) : undefined,
  };
}

export function buildLedgerSummary(event: FrictionEvent, action: string): string {
  const mode = event.evaluation.mode;
  if (mode === "shield") {
    if (action === "block") return "Risky transfer blocked before irreversible movement.";
    if (action === "hold") return "Financial action paused for identity verification.";
    return "Financial action released after review.";
  }
  if (mode === "kiln") {
    if (action === "soften") return "Heated message redirected into calmer copy.";
    if (action === "hold") return "Message routed into the cooling drawer.";
    return "Message released after cooldown.";
  }
  if (mode === "quarry") {
    if (action === "interrogate") return "Creative request interrogated before drafting.";
    if (action === "hold") return "Draft paused until intent became more concrete.";
    return "Creative work released after contrast review.";
  }
  if (action === "prescribe") return "Pattern scan generated a friction prescription.";
  if (action === "hold") return "Behavior queued for a deeper scan.";
  return "Pattern cleared without intervention.";
}
