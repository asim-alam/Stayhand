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

function normalizeGroqModel(rawModel: string | undefined): string {
  return (rawModel || "llama-3.3-70b-versatile").trim();
}

export function getConfiguredGeminiModel(): string {
  return normalizeGeminiModel(process.env.GEMINI_MODEL);
}

export function getConfiguredGroqModel(): string {
  return normalizeGroqModel(process.env.GROQ_MODEL);
}

export function getGeminiApiKey(): string | undefined {
  return process.env.GEMINI_API_KEY;
}

export function getGroqApiKey(): string | undefined {
  return process.env.GROQ_API_KEY;
}

export function extractGeminiText(payload: unknown): string {
  const candidates = (payload as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  }).candidates;
  const text = candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  return text || "";
}

export function tryParseJson(raw: string): Record<string, unknown> | null {
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

export async function generateJson<T>({
  prompt,
  temperature = 0.4,
  timeoutMs = 8000,
}: {
  prompt: string;
  temperature?: number;
  timeoutMs?: number;
}): Promise<{ parsed: T; model: string }> {
  const errors: string[] = [];
  const groqApiKey = getGroqApiKey();

  if (groqApiKey) {
    const model = getConfiguredGroqModel();
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${groqApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: "Return only valid JSON. Do not include markdown fences." },
            { role: "user", content: prompt },
          ],
          temperature,
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        throw new Error(`Groq request failed with ${response.status}.`);
      }

      const payload = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content?.trim() || "";
      const parsed = tryParseJson(content);
      if (!parsed) {
        throw new Error("Groq returned unreadable JSON.");
      }
      return { parsed: parsed as T, model: `groq:${model}` };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Groq request failed.");
    }
  }

  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error(errors.length ? errors.join(" ") : "GROQ_API_KEY and GEMINI_API_KEY missing");
  }
  const model = getConfiguredGeminiModel();
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
        responseMimeType: "application/json",
      },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`${errors.join(" ")} Gemini request failed with ${response.status}.`.trim());
  }

  const parsed = tryParseJson(extractGeminiText(await response.json()));
  if (!parsed) {
    throw new Error(`${errors.join(" ")} Gemini returned unreadable JSON.`.trim());
  }

  return { parsed: parsed as T, model: `gemini:${model}` };
}
