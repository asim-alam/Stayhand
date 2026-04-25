import { buildLedgerEntry } from "@/lib/friction/evaluator";
import { persistLedgerEntry } from "@/lib/runtime/db";
import { clamp, createId, createTraceEntry, nowIso } from "@/lib/runtime/utils";
import type {
  Assessment,
  DemoAction,
  DemoActionId,
  Moment,
  MomentSnapshot,
  MomentSurface,
  Outcome,
  RiskSignal,
  ScenarioFixture,
  SessionMetrics,
  SessionResult,
} from "@/lib/core/types";
import { generateAiSupport } from "@/lib/core/ai";
import type { AiSupport } from "@/lib/core/ai";
import { JUDGE_DEMO_ORDER, getScenario, listScenarios } from "@/lib/scenarios/catalog";
import type { FrictionEvent, InterventionDecision, TraceEntry } from "@/lib/types/runtime";
import { evaluateEvent } from "@/lib/friction/evaluator";

type ActiveMoment = {
  fixture: ScenarioFixture;
  moment: Moment;
  assessment: Assessment;
  outcome: Outcome | null;
  trace: TraceEntry[];
  engineDecision: InterventionDecision;
};

type SessionState = {
  id: string;
  judgeMode: boolean;
  startedAt: string;
  activeBySurface: Partial<Record<MomentSurface, string>>;
  records: Map<string, ActiveMoment>;
  completed: string[];
};

function createSession(judgeMode = false): SessionState {
  return {
    id: createId("session"),
    judgeMode,
    startedAt: nowIso(),
    activeBySurface: {},
    records: new Map(),
    completed: [],
  };
}

function keywordPresent(value: string, patterns: string[]): boolean {
  const text = value.toLowerCase();
  return patterns.some((pattern) => text.includes(pattern));
}

function buildSignals(fixture: ScenarioFixture): RiskSignal[] {
  const content = fixture.content.toLowerCase();
  const cues = fixture.context.cues || [];
  const history = fixture.context.history || [];
  const signals: RiskSignal[] = [];

  if (fixture.surface === "send") {
    if (keywordPresent(content, ["cannot believe", "exactly why", "fix it now", "on you, not us"])) {
      signals.push({
        id: "emotional-language",
        label: "Emotion is steering the draft",
        detail: "The wording carries blame or frustration strongly enough to outlive the point you actually want to make.",
        severity: "high",
        weight: 28,
      });
    }
    if (keywordPresent((fixture.context.timing || "").toLowerCase(), ["pm", "am"]) && keywordPresent((fixture.context.timing || "").toLowerCase(), ["11:", "12:"])) {
      signals.push({
        id: "late-night-send",
        label: "Late-night send window",
        detail: "Judgment usually drops late at night while urgency feels artificially high.",
        severity: "medium",
        weight: 16,
      });
    }
    if (cues.includes("relationship risk") || history.some((item) => item.toLowerCase().includes("renewal"))) {
      signals.push({
        id: "relationship-risk",
        label: "Relationship cost is high",
        detail: "The recipient relationship matters enough that tone damage would outlast this one message.",
        severity: "medium",
        weight: 15,
      });
    }
    if (keywordPresent(content, ["now", "twice", "already asked"])) {
      signals.push({
        id: "urgency-pressure",
        label: "Urgency is compressing judgment",
        detail: "The draft is trying to force action immediately instead of creating clarity first.",
        severity: "medium",
        weight: 14,
      });
    }
  }

  if (fixture.surface === "buy") {
    if (Number(fixture.context.amount || 0) >= 250) {
      signals.push({
        id: "amount-threshold",
        label: "Amount crosses the pause threshold",
        detail: "This is expensive enough that a short pause can materially improve the decision.",
        severity: "high",
        weight: 24,
      });
    }
    if (keywordPresent(content, ["minutes left", "limited", "claim", "buy now"]) || cues.includes("countdown pressure")) {
      signals.push({
        id: "urgency-offer",
        label: "The checkout is creating artificial urgency",
        detail: "A countdown is pressuring speed more than it is improving fit.",
        severity: "high",
        weight: 22,
      });
    }
    if (cues.includes("duplicate category") || history.some((item) => item.toLowerCase().includes("bought"))) {
      signals.push({
        id: "duplicate-risk",
        label: "This looks close to a recent purchase",
        detail: "The pattern suggests replacement-by-default instead of a new need.",
        severity: "medium",
        weight: 18,
      });
    }
    if (cues.includes("goal mismatch") || (fixture.context.goals || []).length > 0) {
      signals.push({
        id: "goal-mismatch",
        label: "The purchase conflicts with stated goals",
        detail: "Your recent budget or savings goals point in a different direction than this checkout.",
        severity: "medium",
        weight: 18,
      });
    }
    if (cues.includes("late-night browsing")) {
      signals.push({
        id: "low-energy-window",
        label: "Low-energy hours increase impulse risk",
        detail: "This is happening in the kind of window where convenience often beats reflection.",
        severity: "low",
        weight: 10,
      });
    }
  }

  if (fixture.surface === "reply") {
    if (keywordPresent(content, ["if you had", "i am not repeating", "stop tagging me", "fine, i will"])) {
      signals.push({
        id: "heated-reply",
        label: "Your reply is carrying heat back into the thread",
        detail: "The draft mirrors pressure instead of redirecting the conversation toward clarity or a boundary.",
        severity: "high",
        weight: 26,
      });
    }
    if (keywordPresent((fixture.context.incomingTone || "").toLowerCase(), ["passive", "manipulative", "frustrated"])) {
      signals.push({
        id: "incoming-pressure",
        label: "The incoming tone is already loaded",
        detail: "When the other message is sharp or manipulative, matching the tone usually deepens the regret.",
        severity: "medium",
        weight: 16,
      });
    }
    if (cues.includes("manager-visible") || cues.includes("group visibility")) {
      signals.push({
        id: "audience-risk",
        label: "The audience raises the cost of a bad reply",
        detail: "This reply lands in a context where social damage spreads faster than repair.",
        severity: "medium",
        weight: 15,
      });
    }
    if (cues.includes("boundary needed")) {
      signals.push({
        id: "boundary-risk",
        label: "This moment needs a boundary, not more explanation",
        detail: "The safest move is usually concise and calm when the message is trying to hook guilt.",
        severity: "medium",
        weight: 14,
      });
    }
  }

  return signals;
}

function getActionSet(surface: MomentSurface, revised: boolean): DemoAction[] {
  if (surface === "buy") {
    return [
      { id: "compare", label: "Compare first", detail: "Put this next to your goals and recent purchases.", primary: true },
      { id: "save", label: "Save for later", detail: "Add a delay so urgency stops steering the decision." },
      { id: "continue", label: "Continue anyway", detail: "Proceed with the purchase as-is.", tone: "danger" },
    ];
  }

  return [
    {
      id: revised ? "send_safer" : "revise",
      label: revised ? "Use safer version" : surface === "send" ? "Rewrite it" : "Rewrite reply",
      detail: revised
        ? "Use the lower-heat version instead of the original."
        : "Let Stayhand lower the heat without losing your point.",
      primary: true,
    },
    { id: "wait", label: surface === "send" ? "Wait a beat" : "Pause first", detail: "Create a short cooling gap before deciding." },
    { id: "continue", label: "Continue anyway", detail: "Send the original version without changes.", tone: "danger" },
  ];
}

function buildSuggestionChanges(surface: MomentSurface, signals: RiskSignal[]): string[] {
  if (surface === "buy") {
    return [
      "Moves the decision out of the checkout rush.",
      "Checks the purchase against goals and recent history.",
      "Keeps control with the user instead of the countdown.",
    ];
  }

  const ids = new Set(signals.map((signal) => signal.id));
  const changes: string[] = [];

  if (ids.has("emotional-language") || ids.has("heated-reply")) {
    changes.push("Lowers blame and heat without hiding the core issue.");
  }
  if (ids.has("urgency-pressure") || ids.has("late-night-send")) {
    changes.push("Replaces immediate pressure with a calmer next step.");
  }
  if (ids.has("relationship-risk") || ids.has("audience-risk")) {
    changes.push("Protects the relationship cost around the message.");
  }
  if (ids.has("boundary-risk")) {
    changes.push("Keeps the boundary concise instead of over-explaining.");
  }

  return (changes.length ? changes : ["Keeps the point, lowers the heat.", "Turns reaction into a clearer next step."]).slice(0, 3);
}

function buildAssessment(moment: Moment, fixture: ScenarioFixture, support: Awaited<ReturnType<typeof generateAiSupport>>, engineDecision: InterventionDecision): Assessment {
  const strongest = moment.riskSignals.slice().sort((left, right) => right.weight - left.weight);
  const topReasons = strongest.slice(0, 3).map((signal) => `${signal.label}. ${signal.detail}`);

  let interventionType: Assessment["interventionType"] = "warning";
  if (fixture.surface === "buy") {
    interventionType = strongest.some((signal) => signal.id === "goal-mismatch" || signal.id === "duplicate-risk") ? "comparison" : "delay";
  } else if (strongest.some((signal) => signal.id === "late-night-send")) {
    interventionType = "cooling_prompt";
  } else {
    interventionType = "rewrite";
  }

  const cooldownSeconds = strongest.some((signal) => signal.id === "late-night-send" || signal.id === "heated-reply") ? 10 : undefined;

  const headline =
    fixture.surface === "send"
      ? moment.status === "revised"
        ? "The revised version is safer to send."
        : "This draft is likely to create regret if it leaves unchanged."
      : fixture.surface === "buy"
        ? "This checkout is moving faster than your judgment."
        : moment.status === "revised"
          ? "The revised reply keeps your point without matching the heat."
          : "Your reply is mirroring pressure instead of improving the conversation.";

  const whyNow =
    fixture.surface === "buy"
      ? "The app saw urgency, amount, and mismatch signals at the same time, so it inserted a deliberate pause before payment."
      : `The rules engine detected ${strongest.slice(0, 2).map((signal) => signal.label.toLowerCase()).join(" and ")} before this moment could leave your control.`;

  return {
    headline,
    whyNow,
    interventionType,
    reasons: topReasons.length ? topReasons : engineDecision.reasons,
    recommendedActions: getActionSet(fixture.surface, moment.status === "revised"),
    aiSuggestion: support.suggestion,
    suggestionChanges: buildSuggestionChanges(fixture.surface, strongest),
    reflectionPrompt: support.reflection,
    alternativeChoices: support.alternatives,
    aiLive: support.live,
    aiModel: support.model,
    cooldownSeconds,
  };
}

function toEngineEvent(moment: Moment, fixture: ScenarioFixture): FrictionEvent {
  const tags = moment.riskSignals.map((signal) => signal.id);
  const base: FrictionEvent = {
    id: `${moment.id}_event`,
    sourceId: fixture.surface === "buy" ? "builtin-browser" : "builtin-slack",
    sourceType: "builtin",
    title: moment.title,
    summary: fixture.summary,
    preview: moment.content,
    domain: fixture.surface === "buy" ? "finance" : "communications",
    status: "review",
    actor: fixture.actor,
    surface: fixture.context.channel,
    urgency: clamp(moment.riskScore, 0, 100),
    sentiment: fixture.surface === "buy" ? 28 : clamp(moment.riskScore + 8, 0, 100),
    amount: fixture.context.amount,
    tags,
    receivedAt: moment.createdAt,
    evaluation: {} as FrictionEvent["evaluation"],
    trace: [
      createTraceEntry("captured", `Moment captured from ${fixture.context.channel}`, fixture.summary),
    ],
  };
  base.evaluation = evaluateEvent(base);
  base.trace.push(createTraceEntry("classified", base.evaluation.headline, base.evaluation.recommendation));
  return base;
}

function createMoment(fixture: ScenarioFixture): Moment {
  const riskSignals = buildSignals(fixture);
  const riskScore = clamp(riskSignals.reduce((sum, signal) => sum + signal.weight, 12), 0, 100);
  const timestamp = nowIso();
  return {
    id: createId("moment"),
    surface: fixture.surface,
    title: fixture.title,
    actor: fixture.actor,
    content: fixture.content,
    context: { ...fixture.context, originalContent: fixture.content },
    riskSignals,
    riskScore,
    confidence: clamp(72 + riskSignals.length * 6, 0, 99),
    status: "new",
    scenarioId: fixture.id,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function buildTrace(moment: Moment, fixture: ScenarioFixture, assessment: Assessment): TraceEntry[] {
  return [
    createTraceEntry("captured", `Moment loaded from ${fixture.context.channel}`, fixture.summary),
    createTraceEntry("classified", assessment.headline, assessment.whyNow, moment.riskScore >= 70 ? "warning" : "neutral"),
  ];
}

function actionToLedgerAction(surface: MomentSurface, action: DemoActionId): string {
  if (surface === "buy") {
    return action === "continue" ? "release" : action === "save" ? "hold" : "block";
  }
  if (action === "continue") {
    return "release";
  }
  if (action === "wait") {
    return "hold";
  }
  return "soften";
}

function buildOutcome(record: ActiveMoment, action: DemoActionId): Outcome {
  const moment = record.moment;
  const changedOriginal = action !== "continue";
  const valueSaved = moment.surface === "buy" && action !== "continue" ? Number(moment.context.amount || 0) : undefined;
  const heatReduced = moment.surface !== "buy" && action !== "continue" ? clamp(Math.round(moment.riskScore * 0.38), 8, 42) : undefined;
  const decisionQualityDelta = action === "continue" ? -4 : action === "wait" ? 12 : action === "save" ? 16 : 21;

  const summary =
    moment.surface === "buy"
      ? action === "continue"
        ? "You chose speed over the pause and checked out anyway."
        : "You broke the urgency loop and kept the purchase from auto-completing."
      : action === "continue"
        ? "You sent the original version without using the pause."
        : moment.status === "revised" || action === "send_safer"
          ? "You used the safer version instead of the original draft."
          : "You accepted the pause and changed the tone before sending.";

  return {
    actionTaken: action,
    changedOriginal,
    estimatedValueSaved: valueSaved,
    heatReduced,
    decisionQualityDelta,
    summary,
    completedAt: nowIso(),
  };
}

class DemoService {
  private session = createSession(false);

  async startMoment(surface: MomentSurface, scenarioId?: string, judgeMode?: boolean): Promise<MomentSnapshot> {
    if (typeof judgeMode === "boolean" && judgeMode !== this.session.judgeMode) {
      this.reset(judgeMode);
    }

    const currentId = this.session.activeBySurface[surface];
    const existing = currentId ? this.session.records.get(currentId) : null;
    if (existing && existing.fixture.id === (scenarioId || existing.fixture.id) && !existing.outcome) {
      return this.snapshotFor(existing);
    }

    const fixture = getScenario(surface, scenarioId);
    const moment = createMoment(fixture);
    const engineEvent = toEngineEvent(moment, fixture);
    const fallbackAssessment = buildAssessment(
      moment,
      fixture,
      {
        suggestion: fixture.fallbackSuggestion,
        explanation: fixture.fallbackReflection,
        reflection: fixture.fallbackReflection,
        alternatives: fixture.fallbackAlternatives,
        live: false,
        model: null,
      },
      engineEvent.evaluation
    );

    let support: AiSupport = {
      suggestion: fixture.fallbackSuggestion,
      explanation: fixture.fallbackReflection,
      reflection: fixture.fallbackReflection,
      alternatives: fixture.fallbackAlternatives,
      live: false,
      model: null,
    };

    try {
      support = await generateAiSupport(moment, fallbackAssessment, fixture);
    } catch {
      support = {
        suggestion: fixture.fallbackSuggestion,
        explanation: fixture.fallbackReflection,
        reflection: fixture.fallbackReflection,
        alternatives: fixture.fallbackAlternatives,
        live: false,
        model: null,
      };
    }

    const assessment = buildAssessment(moment, fixture, support, engineEvent.evaluation);
    const trace = buildTrace(moment, fixture, assessment);

    const record: ActiveMoment = {
      fixture,
      moment,
      assessment,
      outcome: null,
      trace,
      engineDecision: engineEvent.evaluation,
    };

    this.session.records.set(moment.id, record);
    this.session.activeBySurface[surface] = moment.id;
    return this.snapshotFor(record);
  }

  async evaluateMoment(momentId: string): Promise<MomentSnapshot | null> {
    const record = this.session.records.get(momentId);
    if (!record) {
      return null;
    }
    record.moment.updatedAt = nowIso();
    record.moment.status = record.moment.status === "revised" ? "revised" : "paused";
    record.trace.push(createTraceEntry("decision", record.assessment.headline, record.assessment.whyNow, "warning"));
    return this.snapshotFor(record);
  }

  async reviseMoment(momentId: string): Promise<MomentSnapshot | null> {
    const record = this.session.records.get(momentId);
    if (!record || record.outcome) {
      return null;
    }

    record.moment.content = record.assessment.aiSuggestion;
    record.moment.status = "revised";
    record.moment.riskScore = clamp(record.moment.riskScore - 24, 12, 100);
    record.moment.updatedAt = nowIso();

    const engineEvent = toEngineEvent(record.moment, record.fixture);
    let support: AiSupport = {
      suggestion: record.moment.content,
      explanation: record.fixture.fallbackReflection,
      reflection: record.fixture.fallbackReflection,
      alternatives: record.fixture.fallbackAlternatives,
      live: false,
      model: null,
    };

    try {
      support = await generateAiSupport(record.moment, record.assessment, record.fixture);
    } catch {
      support = {
        suggestion: record.moment.content,
        explanation: record.fixture.fallbackReflection,
        reflection: record.fixture.fallbackReflection,
        alternatives: record.fixture.fallbackAlternatives,
        live: false,
        model: null,
      };
    }

    record.assessment = buildAssessment(record.moment, record.fixture, support, engineEvent.evaluation);
    record.trace.push(createTraceEntry("decision", "Safer version prepared", "The draft was rewritten to reduce regret risk.", "positive"));
    return this.snapshotFor(record);
  }

  async continueMoment(momentId: string, action: DemoActionId): Promise<MomentSnapshot | null> {
    const record = this.session.records.get(momentId);
    if (!record || record.outcome) {
      return null;
    }

    record.moment.status = "completed";
    record.moment.updatedAt = nowIso();
    const outcome = buildOutcome(record, action);
    record.outcome = outcome;
    record.trace.push(createTraceEntry("resolved", "Outcome recorded", outcome.summary, action === "continue" ? "neutral" : "positive"));

    const event = toEngineEvent(record.moment, record.fixture);
    const ledgerEntry = buildLedgerEntry(event, actionToLedgerAction(record.moment.surface, action));
    ledgerEntry.summary = outcome.summary;
    ledgerEntry.saved = outcome.estimatedValueSaved;
    ledgerEntry.heat = outcome.heatReduced;
    ledgerEntry.quotient = outcome.decisionQualityDelta ? clamp(50 + outcome.decisionQualityDelta, 0, 100) : undefined;
    persistLedgerEntry(ledgerEntry);

    if (!this.session.completed.includes(momentId)) {
      this.session.completed.push(momentId);
    }

    return this.snapshotFor(record);
  }

  reset(judgeMode = false): SessionResult {
    this.session = createSession(judgeMode);
    return this.getResults();
  }

  getResults(): SessionResult {
    const completedRecords = this.session.completed
      .map((id) => this.session.records.get(id))
      .filter((record): record is ActiveMoment => Boolean(record && record.outcome));
    const metrics = this.buildMetrics(completedRecords);

    return {
      id: this.session.id,
      judgeMode: this.session.judgeMode,
      startedAt: this.session.startedAt,
      metrics,
      completed: completedRecords.map((record) => ({
        surface: record.moment.surface,
        title: record.moment.title,
        outcome: record.outcome!,
        assessment: record.assessment,
      })),
    };
  }

  getScenarios(surface?: MomentSurface): ScenarioFixture[] {
    return listScenarios(surface);
  }

  private buildMetrics(records: ActiveMoment[]): SessionMetrics {
    const valueSaved = records.reduce((sum, record) => sum + Number(record.outcome?.estimatedValueSaved || 0), 0);
    const heatReduced = records.reduce((sum, record) => sum + Number(record.outcome?.heatReduced || 0), 0);
    const qualityDeltas = records
      .map((record) => record.outcome?.decisionQualityDelta)
      .filter((value): value is number => typeof value === "number");

    return {
      completedMoments: records.length,
      revisedMoments: records.filter((record) => record.outcome?.changedOriginal).length,
      pausedMoments: records.filter((record) => record.outcome?.actionTaken === "wait" || record.outcome?.actionTaken === "save").length,
      totalEstimatedValueSaved: valueSaved,
      totalHeatReduced: heatReduced,
      averageDecisionQualityDelta: qualityDeltas.length
        ? Math.round(qualityDeltas.reduce((sum, value) => sum + value, 0) / qualityDeltas.length)
        : 0,
    };
  }

  private snapshotFor(record: ActiveMoment): MomentSnapshot {
    const nextSurface = this.session.judgeMode ? this.nextSurface(record.moment.surface) : null;
    return {
      moment: record.moment,
      assessment: record.assessment,
      outcome: record.outcome,
      trace: [...record.trace],
      judgeMode: this.session.judgeMode,
      nextSurface,
    };
  }

  private nextSurface(current: MomentSurface): MomentSurface | null {
    const currentIndex = JUDGE_DEMO_ORDER.indexOf(current);
    if (currentIndex === -1 || currentIndex === JUDGE_DEMO_ORDER.length - 1) {
      return null;
    }
    return JUDGE_DEMO_ORDER[currentIndex + 1];
  }
}

export const demoService = new DemoService();
