import type { TraceEntry, TraceTone } from "@/lib/types/runtime";

export function createId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function createTraceEntry(
  type: TraceEntry["type"],
  title: string,
  detail: string,
  tone: TraceTone = "neutral"
): TraceEntry {
  return {
    id: createId("trace"),
    title,
    detail,
    tone,
    type,
    at: nowIso(),
  };
}
