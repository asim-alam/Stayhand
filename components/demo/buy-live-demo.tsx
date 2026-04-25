"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { SurfaceTopbar } from "@/components/real-mode/surface-topbar";
import type { BuyProduct, BuyQuestionMessage, BuyVerdictResult } from "@/lib/real-mode/types";

const TOTAL_QUESTIONS = 5;

const DEMO_PRODUCT: BuyProduct = {
  title: "AirPods Pro 3",
  image: "https://store.storeimages.cdn-apple.com/1/as-images.apple.com/is/og-airpods-pro-3-202509?wid=1200&hei=630&fmt=jpeg&qlt=95&.v=1755768134799",
  price: "$249.00",
  store: "apple.com",
  url: "https://www.apple.com/shop/product/mfhp4ll/a",
};

const SEEDED_QUESTIONS = [
  "what happened in the last ten minutes that put airpods pro 3 in front of you right now?",
  "what feeling are you expecting this purchase to fix tonight?",
  "when you bought something for this same reason before, where did it end up?",
  "if the discount disappeared and the price stayed, what would still be true about this purchase?",
  "if tomorrow-morning you had to explain this checkout to someone calm, what would your best argument be?",
];

const SEEDED_ANSWERS = [
  [
    "my earbuds still work, but i saw the new noise cancellation and started comparing them immediately.",
    "i have a flight next week and convinced myself this would make the trip easier.",
  ],
  [
    "mostly relief. i want the feeling that one upgrade will make work and travel less noisy.",
    "i think i want to feel prepared, even though this is not the only way to solve that.",
  ],
  [
    "usually it sits in the same drawer as the thing it replaced. the excitement fades pretty fast.",
    "i still use some of those purchases, but i rarely needed them the same day i bought them.",
  ],
  [
    "the flight would still be real, but the urgency would feel weaker.",
    "i would still want better noise control, but i could compare with the earbuds i already own.",
  ],
  [
    "my best argument is travel comfort, not necessity. waiting a day would not ruin anything.",
    "i can make a case for it, but it is not strong enough to need checkout tonight.",
  ],
];

const FALLBACK_VERDICT: BuyVerdictResult = {
  verdict: "WAIT_24H",
  reasoning:
    "there is a real use case here, but the transcript keeps mixing travel comfort with upgrade momentum. that is exactly the kind of cart that should survive one night's sleep.",
  underlying_need: "you want less noise and more control during travel.",
  cheaper_alternative:
    "use the earbuds you already own on the next trip, write down what actually fails, then decide after the flight.",
  urgency_score: 6,
};

type VerdictResponse = {
  result: BuyVerdictResult;
  live: boolean;
  model: string | null;
};

export function BuyLiveDemo() {
  const searchParams = useSearchParams();
  const judgeMode = searchParams.get("judge") === "1";
  const [messages, setMessages] = useState<BuyQuestionMessage[]>([
    { role: "assistant", content: SEEDED_QUESTIONS[0] },
  ]);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [verdict, setVerdict] = useState<VerdictResponse | null>(null);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState("");

  const answerOptions = useMemo(() => SEEDED_ANSWERS[answeredCount] ?? [], [answeredCount]);

  function resetDemo() {
    setMessages([{ role: "assistant", content: SEEDED_QUESTIONS[0] }]);
    setAnsweredCount(0);
    setVerdict(null);
    setThinking(false);
    setError("");
  }

  async function computeVerdict(transcript: BuyQuestionMessage[]) {
    setThinking(true);
    setError("");
    try {
      const response = await fetch("/api/buy/verdict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: DEMO_PRODUCT, transcript }),
      });
      const data = (await response.json()) as Partial<VerdictResponse> & { error?: string };
      if (!response.ok || !data.result) {
        throw new Error(data.error || "verdict failed");
      }
      setVerdict({
        result: data.result,
        live: Boolean(data.live),
        model: data.model ?? null,
      });
    } catch (verdictError) {
      setError(verdictError instanceof Error ? verdictError.message : "verdict failed");
      setVerdict({ result: FALLBACK_VERDICT, live: false, model: null });
    } finally {
      setThinking(false);
    }
  }

  async function chooseAnswer(answer: string) {
    if (thinking || verdict) return;
    const nextAnsweredCount = answeredCount + 1;
    const nextMessages: BuyQuestionMessage[] = [...messages, { role: "user", content: answer }];

    if (nextAnsweredCount >= TOTAL_QUESTIONS) {
      setMessages(nextMessages);
      setAnsweredCount(nextAnsweredCount);
      await computeVerdict(nextMessages);
      return;
    }

    setMessages([...nextMessages, { role: "assistant", content: SEEDED_QUESTIONS[nextAnsweredCount] }]);
    setAnsweredCount(nextAnsweredCount);
  }

  return (
    <main className="real-shell demo-shell" data-surface="buy">
      <SurfaceTopbar
        surface="buy"
        modeLabel={judgeMode ? "judge demo" : "demo mode"}
        actionHref="/buy"
        actionLabel="Try live"
        getSurfaceHref={(surface) => `/demo/${surface}${judgeMode ? "?judge=1" : ""}`}
      />

      <section className="surface-hero">
        <div className="eyebrow">Before you buy</div>
        <h1>Make the real cart survive the same conversation.</h1>
        <p>
          This seeded demo follows the live buy flow with a real product page, fixed judge-friendly answers,
          and the same verdict shape used by the live purchase therapist.
        </p>
        <div className="surface-hero__meta">
          <span className="surface-chip"><strong>product</strong> Apple AirPods Pro 3</span>
          <span className="surface-chip"><strong>flow</strong> product to five questions to verdict</span>
        </div>
      </section>

      {error && <div className="banner error">{error}</div>}

      <div className="buy-layout">
        <aside className="reply-sidebar">
          <section className="real-card">
            <div className="row spread">
              <div>
                <div className="eyebrow">The item</div>
                <h2>Actual product in the cart.</h2>
              </div>
              <button type="button" className="button ghost" onClick={resetDemo}>
                Reset
              </button>
            </div>

            <article className="buy-product-card demo-buy-product">
              {DEMO_PRODUCT.image && <img src={DEMO_PRODUCT.image} alt="" />}
              <div>
                <strong>{DEMO_PRODUCT.title}</strong>
                <p>{DEMO_PRODUCT.store}</p>
                <p style={{ color: "var(--text)", marginTop: 6 }}>{DEMO_PRODUCT.price}</p>
              </div>
            </article>

            <a className="button ghost" href={DEMO_PRODUCT.url} target="_blank" rel="noreferrer">
              Open original product
            </a>

            <div className="buy-progress">
              {Array.from({ length: TOTAL_QUESTIONS }).map((_, index) => (
                <span key={index} className={`buy-progress__dot ${index < answeredCount ? "active" : ""}`} />
              ))}
            </div>
            <p className="real-help">
              {verdict ? "verdict ready" : `question ${Math.min(answeredCount + 1, TOTAL_QUESTIONS)} of ${TOTAL_QUESTIONS}`}
            </p>
          </section>
        </aside>

        <section className="real-card real-card--accent">
          <div>
            <div className="eyebrow">The conversation</div>
            <h2>Five questions before checkout.</h2>
          </div>

          <div className="buy-transcript">
            {messages.map((message, index) => (
              <article
                key={`${message.role}-${index}-${message.content.slice(0, 16)}`}
                className={`buy-message ${message.role === "assistant" ? "buy-message--assistant" : "buy-message--user"}`}
              >
                <p>{message.content}</p>
              </article>
            ))}
            {thinking && (
              <article className="buy-message buy-message--assistant">
                <p>thinking...</p>
              </article>
            )}
          </div>

          {!verdict && (
            <div className="demo-buy-answer-grid">
              {answerOptions.map((answer) => (
                <button
                  key={answer}
                  type="button"
                  className="demo-buy-answer-button"
                  disabled={thinking}
                  onClick={() => void chooseAnswer(answer)}
                >
                  {answer}
                </button>
              ))}
            </div>
          )}

          {verdict && (
            <section className="verdict-receipt demo-verdict-receipt animate-in">
              <div>
                <div className="eyebrow">The verdict</div>
                <div className="verdict-receipt__decision">
                  {verdict.result.verdict === "BUY"
                    ? "buy it."
                    : verdict.result.verdict === "WAIT_24H"
                      ? "wait 24 hours."
                      : "don't."}
                </div>
              </div>
              <article className="question-card">
                <strong>Why</strong>
                <p>{verdict.result.reasoning}</p>
              </article>
              <div className="verdict-receipt__grid">
                <article className="question-card">
                  <strong>What this is really about</strong>
                  <p>{verdict.result.underlying_need}</p>
                </article>
                <article className="question-card">
                  <strong>Cheaper thing that actually helps</strong>
                  <p>{verdict.result.cheaper_alternative}</p>
                </article>
              </div>
              <div className="row spread">
                <span className="surface-chip"><strong>urgency score</strong>{verdict.result.urgency_score} / 10</span>
                <span className="surface-chip"><strong>{verdict.live ? "live ai" : "fallback"}</strong>{verdict.model || "deterministic"}</span>
              </div>
              <div className="row">
                <button type="button" className="button ghost" onClick={resetDemo}>
                  Run again
                </button>
                {judgeMode && (
                  <a href="/demo/reply?judge=1" className="button primary">
                    Next: Reply
                  </a>
                )}
              </div>
            </section>
          )}
        </section>
      </div>
    </main>
  );
}
