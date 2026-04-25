import type { Assessment, Moment, ScenarioFixture } from "@/lib/core/types";

export interface AiSupport {
  suggestion: string;
  explanation: string;
  reflection: string;
  alternatives: string[];
  live: boolean;
  model: string | null;
}

function normalizeGeminiModel(rawModel: string | undefined): string {
  const model = (rawModel || "").trim().toLowerCase();

  const aliases: Record<string, string> = {
    "gemini-3.0-flash": "gemini-3-flash-preview",
    "gemini-3.0-flash-preview": "gemini-3-flash-preview",
    "gemini-3-flash": "gemini-3-flash-preview",
    "gemini-3.0-pro": "gemini-3-pro-preview",
    "gemini-3.0-pro-preview": "gemini-3-pro-preview",
    "gemini-3-pro": "gemini-3-pro-preview",
  };

  if (!model) {
    return "gemini-3-flash-preview";
  }

  return aliases[model] || model;
}

function extractText(payload: unknown): string {
  const candidates = (payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates;
  const text = candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  return text || "";
}

function tryParseJson(raw: string): Record<string, unknown> | null {
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function generateAiSupport(moment: Moment, assessment: Assessment, fixture: ScenarioFixture): Promise<AiSupport> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = normalizeGeminiModel(process.env.GEMINI_MODEL);

  if (!apiKey) {
    return {
      suggestion: fixture.fallbackSuggestion,
      explanation: fixture.fallbackReflection,
      reflection: fixture.fallbackReflection,
      alternatives: fixture.fallbackAlternatives,
      live: false,
      model: null,
    };
  }

  const prompt = [
    "You are Stayhand, a premium consumer app that adds intentional friction only when risk is high.",
    `Surface: ${moment.surface}`,
    `Moment title: ${moment.title}`,
    `Original content: ${moment.context.originalContent || moment.content}`,
    `Current content: ${moment.content}`,
    `Why friction triggered: ${assessment.whyNow}`,
    `Reasons: ${assessment.reasons.join(" | ")}`,
    "Return compact JSON with keys suggestion, explanation, reflection, alternatives.",
    "For send or reply surfaces, suggestion must be a ready-to-send safer rewrite that preserves the user's point.",
    "For buy surfaces, suggestion should be the safest user-facing next step in plain English.",
    "explanation should explain why the pause appeared in one sentence.",
    "reflection should help the user think clearly without sounding preachy.",
    "alternatives must be an array of exactly 2 short options.",
    "No markdown. No preamble.",
  ].join("\n");

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.5,
        responseMimeType: "application/json",
      },
    }),
    signal: AbortSignal.timeout(6000),
  });

  if (!response.ok) {
    throw new Error(`Gemini request failed with ${response.status}.`);
  }

  const payload = await response.json();
  const raw = extractText(payload);
  const parsed = tryParseJson(raw);

  if (!parsed) {
    throw new Error("Gemini returned an unreadable payload.");
  }

  const suggestion = typeof parsed.suggestion === "string" ? parsed.suggestion : fixture.fallbackSuggestion;
  const explanation = typeof parsed.explanation === "string" ? parsed.explanation : fixture.fallbackReflection;
  const reflection = typeof parsed.reflection === "string" ? parsed.reflection : fixture.fallbackReflection;
  const alternatives = Array.isArray(parsed.alternatives)
    ? parsed.alternatives.filter((item): item is string => typeof item === "string").slice(0, 2)
    : fixture.fallbackAlternatives;

  return {
    suggestion,
    explanation,
    reflection,
    alternatives: alternatives.length === 2 ? alternatives : fixture.fallbackAlternatives,
    live: true,
    model,
  };
}
