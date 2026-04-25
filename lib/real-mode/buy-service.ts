import { clamp } from "@/lib/runtime/utils";
import { generateJson } from "@/lib/real-mode/gemini";
import type {
  BuyIntakeResult,
  BuyProduct,
  BuyQuestionMessage,
  BuyQuestionResult,
  BuyVerdictResult,
} from "@/lib/real-mode/types";

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function pick(html: string, regexes: RegExp[]): string | null {
  for (const regex of regexes) {
    const match = html.match(regex);
    if (match?.[1]) {
      return decodeEntities(match[1].trim());
    }
  }
  return null;
}

function extractPrice(html: string): string | null {
  const metaPrice = pick(html, [
    /<meta[^>]+property=["']product:price:amount["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+property=["']og:price:amount["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+itemprop=["']price["'][^>]+content=["']([^"']+)["']/i,
  ]);
  const metaCurrency = pick(html, [
    /<meta[^>]+property=["']product:price:currency["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+property=["']og:price:currency["'][^>]+content=["']([^"']+)["']/i,
  ]);
  if (metaPrice) {
    const prefix = (metaCurrency || "USD") === "USD" ? "$" : `${metaCurrency || ""} `;
    return `${prefix}${metaPrice}`;
  }

  const bodyText = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");
  const match = bodyText.match(/[$£€]\s?\d{1,4}(?:[.,]\d{2})?/);
  return match ? match[0].replace(/\s+/g, "") : null;
}

function extractInlinePrice(input: string): string | null {
  const match = input.match(/[$£€]\s?\d{1,4}(?:[.,]\d{2})?/);
  return match ? match[0].replace(/\s+/g, "") : null;
}

function looksLikeUrl(input: string): boolean {
  return /^https?:\/\//i.test(input.trim());
}

function buildStore(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function fallbackQuestion(product: BuyProduct, history: BuyQuestionMessage[], questionIndex: number): string {
  const answers = history.filter((message) => message.role === "user");
  const latestAnswer = answers.at(-1)?.content.trim();
  const quote = latestAnswer ? `you said "${latestAnswer.slice(0, 60)}". ` : "";
  const title = product.title || "this purchase";

  const prompts = [
    `what happened in the last ten minutes that put ${title.toLowerCase()} in front of you right now?`,
    `${quote}what feeling are you expecting this purchase to fix tonight?`,
    `${quote}when you bought something for this same reason before, where did it end up?`,
    `if the discount disappeared and the price stayed, what would still be true about this purchase?`,
    `${quote}if tomorrow-morning you had to explain this checkout to someone calm, what would your best argument be?`,
  ];

  return prompts[questionIndex] || prompts[prompts.length - 1];
}

function parsePriceValue(price: string | null | undefined): number {
  if (!price) {
    return 0;
  }
  const match = price.replace(/[, ]/g, "").match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

function fallbackVerdict(product: BuyProduct, transcript: BuyQuestionMessage[]): BuyVerdictResult {
  const priceValue = parsePriceValue(product.price);
  const combined = transcript.filter((message) => message.role === "user").map((message) => message.content.toLowerCase()).join(" ");

  let impulse = 0;
  let durableNeed = 0;

  for (const token of ["deserve", "stress", "hard week", "sale", "discount", "only", "bored", "reward", "impulse", "now"]) {
    if (combined.includes(token)) impulse += 1;
  }
  for (const token of ["replace", "broken", "work", "daily", "trip", "need", "already planned", "specific"]) {
    if (combined.includes(token)) durableNeed += 1;
  }
  if (priceValue >= 250) impulse += 1;

  let verdict: BuyVerdictResult["verdict"] = "WAIT_24H";
  if (durableNeed >= 3 && impulse <= 1) {
    verdict = "BUY";
  } else if (impulse >= 3 && durableNeed <= 1) {
    verdict = "DONT";
  }

  return {
    verdict,
    reasoning:
      verdict === "BUY"
        ? `this sounds more like a defined need than a mood spike. you named a concrete use for ${product.title.toLowerCase()}, and the case held together under questions.`
        : verdict === "DONT"
          ? `the session kept circling back to how this would make you feel, not what it would actually solve. that usually means the cart is carrying emotion, not utility.`
          : `there may be a real use here, but the reasoning is still mixed with urgency or mood. that is usually a sign to let the decision survive one night's sleep first.`,
    underlying_need:
      durableNeed >= impulse
        ? "you want this purchase to solve a practical gap."
        : "you want relief, reward, or a change in state more than the object itself.",
    cheaper_alternative:
      durableNeed >= impulse
        ? "write down the exact use case and compare it against what you already own before paying full emotional price for a guess."
        : "close the tab, leave the cart for tomorrow, and spend ten minutes doing the smaller thing that would calm you down tonight.",
    urgency_score: clamp(durableNeed * 3 + (priceValue > 0 ? 1 : 0), 0, 10),
  };
}

export async function intakeBuyDecision(input: string): Promise<BuyIntakeResult> {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("input is required");
  }

  if (!looksLikeUrl(trimmed)) {
    return {
      product: {
        title: trimmed,
        image: null,
        price: extractInlinePrice(trimmed),
        store: "",
        url: "",
      },
      needsManualDetails: false,
      scrapeFailed: false,
    };
  }

  const store = buildStore(trimmed);

  try {
    const response = await fetch(trimmed, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(9000),
    });

    if (!response.ok) {
      return {
        product: { title: "", image: null, price: null, store, url: trimmed },
        needsManualDetails: true,
        scrapeFailed: true,
      };
    }

    const html = await response.text();
    return {
      product: {
        title: pick(html, [
          /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
          /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i,
          /<title[^>]*>([^<]+)<\/title>/i,
        ]) || "untitled item",
        image: pick(html, [
          /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
          /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
        ]),
        price: extractPrice(html),
        store,
        url: trimmed,
      },
      needsManualDetails: false,
      scrapeFailed: false,
    };
  } catch {
    return {
      product: { title: "", image: null, price: null, store, url: trimmed },
      needsManualDetails: true,
      scrapeFailed: true,
    };
  }
}

export async function generateBuyQuestion(product: BuyProduct, history: BuyQuestionMessage[], questionIndex: number): Promise<{
  result: BuyQuestionResult;
  live: boolean;
  model: string | null;
}> {
  const fallback = fallbackQuestion(product, history, questionIndex);

  const transcript = history
    .map((message) => `${message.role === "assistant" ? "therapist" : "user"}: ${message.content}`)
    .join("\n");

  const prompt = [
    "You are Stayhand's buy therapist.",
    "Voice rules: always lowercase, no exclamation marks, 1-2 sentences, no flattery, no moralizing.",
    `Product: ${product.title}${product.price ? ` for ${product.price}` : ""}${product.store ? ` from ${product.store}` : ""}.`,
    `Question number: ${questionIndex + 1} of 5.`,
    transcript ? `Transcript:\n${transcript}` : "Transcript: (empty)",
    "Return ONLY JSON with a single key named question.",
    "Ask exactly one sharper Socratic question about this purchase.",
  ].join("\n");

  try {
    const { parsed, model } = await generateJson<Partial<BuyQuestionResult>>({
      prompt,
      temperature: 0.8,
      timeoutMs: 10000,
    });

    return {
      result: {
        question: typeof parsed.question === "string" ? parsed.question : fallback,
      },
      live: true,
      model,
    };
  } catch {
    return { result: { question: fallback }, live: false, model: null };
  }
}

export async function generateBuyVerdict(product: BuyProduct, transcript: BuyQuestionMessage[]): Promise<{
  result: BuyVerdictResult;
  live: boolean;
  model: string | null;
}> {
  const fallback = fallbackVerdict(product, transcript);
  const transcriptText = transcript
    .map((message) => `${message.role === "assistant" ? "therapist" : "user"}: ${message.content}`)
    .join("\n");

  const prompt = [
    "You are Stayhand, delivering a purchase verdict after a short questioning session.",
    "Tone: lowercase, surgical, kind, specific to this product and this person.",
    `Product: ${product.title}${product.price ? `, ${product.price}` : ""}${product.store ? `, ${product.store}` : ""}.`,
    `Transcript:\n${transcriptText}`,
    "Return ONLY JSON with keys verdict, reasoning, underlying_need, cheaper_alternative, urgency_score.",
    'verdict must be one of "BUY", "WAIT_24H", "DONT".',
    "reasoning must be one short paragraph.",
    "underlying_need must be one short sentence.",
    "cheaper_alternative must be one concrete alternative.",
    "urgency_score must be an integer from 0 to 10.",
  ].join("\n");

  try {
    const { parsed, model } = await generateJson<Partial<BuyVerdictResult>>({
      prompt,
      temperature: 0.45,
      timeoutMs: 10000,
    });

    const verdict = parsed.verdict === "BUY" || parsed.verdict === "WAIT_24H" || parsed.verdict === "DONT"
      ? parsed.verdict
      : fallback.verdict;

    return {
      result: {
        verdict,
        reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : fallback.reasoning,
        underlying_need: typeof parsed.underlying_need === "string" ? parsed.underlying_need : fallback.underlying_need,
        cheaper_alternative: typeof parsed.cheaper_alternative === "string"
          ? parsed.cheaper_alternative
          : fallback.cheaper_alternative,
        urgency_score: clamp(typeof parsed.urgency_score === "number" ? parsed.urgency_score : fallback.urgency_score, 0, 10),
      },
      live: true,
      model,
    };
  } catch {
    return { result: fallback, live: false, model: null };
  }
}

