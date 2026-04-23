import type { TraceEntry } from "@/lib/types/runtime";

export type MomentSurface = "send" | "buy" | "reply";
export type MomentStatus = "new" | "paused" | "revised" | "continued" | "completed";
export type InterventionType = "warning" | "cooling_prompt" | "comparison" | "delay" | "rewrite";
export type DemoActionId =
  | "revise"
  | "send_safer"
  | "compare"
  | "save"
  | "wait"
  | "continue";
export type SignalSeverity = "low" | "medium" | "high";

export interface RiskSignal {
  id: string;
  label: string;
  detail: string;
  severity: SignalSeverity;
  weight: number;
}

export interface MomentContext {
  channel: string;
  recipient?: string;
  incomingMessage?: string;
  incomingTone?: string;
  draftTone?: string;
  merchant?: string;
  amount?: number;
  currency?: string;
  timing?: string;
  goals?: string[];
  history?: string[];
  originalContent?: string;
  cues?: string[];
}

export interface Moment {
  id: string;
  surface: MomentSurface;
  title: string;
  actor: string;
  content: string;
  context: MomentContext;
  riskSignals: RiskSignal[];
  riskScore: number;
  confidence: number;
  status: MomentStatus;
  scenarioId: string;
  createdAt: string;
  updatedAt: string;
}

export interface DemoAction {
  id: DemoActionId;
  label: string;
  detail: string;
  primary?: boolean;
  tone?: "default" | "subtle" | "danger";
}

export interface Assessment {
  headline: string;
  whyNow: string;
  interventionType: InterventionType;
  reasons: string[];
  recommendedActions: DemoAction[];
  aiSuggestion: string;
  reflectionPrompt: string;
  alternativeChoices: string[];
  aiLive: boolean;
  aiModel?: string | null;
  cooldownSeconds?: number;
}

export interface Outcome {
  actionTaken: string;
  changedOriginal: boolean;
  estimatedValueSaved?: number;
  heatReduced?: number;
  decisionQualityDelta?: number;
  summary: string;
  completedAt: string;
}

export interface ScenarioFixture {
  id: string;
  surface: MomentSurface;
  title: string;
  summary: string;
  actor: string;
  content: string;
  context: MomentContext;
  originalLabel: string;
  fallbackSuggestion: string;
  fallbackReflection: string;
  fallbackAlternatives: string[];
  featured?: boolean;
}

export interface MomentSnapshot {
  moment: Moment;
  assessment: Assessment;
  outcome: Outcome | null;
  trace: TraceEntry[];
  judgeMode: boolean;
  nextSurface: MomentSurface | null;
}

export interface SessionMetrics {
  completedMoments: number;
  revisedMoments: number;
  pausedMoments: number;
  totalEstimatedValueSaved: number;
  totalHeatReduced: number;
  averageDecisionQualityDelta: number;
}

export interface SessionResult {
  id: string;
  judgeMode: boolean;
  startedAt: string;
  metrics: SessionMetrics;
  completed: Array<{
    surface: MomentSurface;
    title: string;
    outcome: Outcome;
    assessment: Assessment;
  }>;
}
