"use client";

import { FormEvent, useState } from "react";
import { SurfaceTopbar } from "@/components/real-mode/surface-topbar";
import type {
  BuyIntakeResult,
  BuyProduct,
  BuyQuestionMessage,
  BuyVerdictResult,
} from "@/lib/real-mode/types";

const TOTAL_QUESTIONS = 5;

type VerdictResponse = {
  result: BuyVerdictResult;
  live: boolean;
  model: string | null;
};

type IntakeResponse = BuyIntakeResult & {
  success: boolean;
  error?: string;
};

function emptyProduct(): BuyProduct {
  return {
    title: "",
    image: null,
    price: null,
    store: "",
    url: "",
  };
}

export default function BuyPage() {
  const [step, setStep] = useState<"intake" | "session" | "verdict">("intake");
  const [input, setInput] = useState("");
  const [intaking, setIntaking] = useState(false);
  const [product, setProduct] = useState<BuyProduct>(emptyProduct());
  const [needsManualDetails, setNeedsManualDetails] = useState(false);
  const [scrapeFailed, setScrapeFailed] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualPrice, setManualPrice] = useState("");

  const [messages, setMessages] = useState<BuyQuestionMessage[]>([]);
  const [answer, setAnswer] = useState("");
  const [answeredCount, setAnsweredCount] = useState(0);
  const [thinking, setThinking] = useState(false);
  const [verdict, setVerdict] = useState<VerdictResponse | null>(null);
  const [error, setError] = useState("");

  function resetAll() {
    setStep("intake");
    setInput("");
    setIntaking(false);
    setProduct(emptyProduct());
    setNeedsManualDetails(false);
    setScrapeFailed(false);
    setManualTitle("");
    setManualPrice("");
    setMessages([]);
    setAnswer("");
    setAnsweredCount(0);
    setThinking(false);
    setVerdict(null);
    setError("");
  }

  async function readSseText(response: Response, onChunk: (chunk: string) => void) {
    if (!response.body) {
      throw new Error("empty stream");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finished = false;

    while (!finished) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      while (buffer.includes("\n")) {
        const index = buffer.indexOf("\n");
        let line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        if (line.endsWith("\r")) {
          line = line.slice(0, -1);
        }
        if (!line || line.startsWith(":") || !line.startsWith("data: ")) {
          continue;
        }

        const payload = line.slice(6).trim();
        if (payload === "[DONE]") {
          finished = true;
          break;
        }

        const parsed = JSON.parse(payload) as { delta?: string };
        if (parsed.delta) {
          onChunk(parsed.delta);
        }
      }
    }
  }

  async function streamQuestion(nextProduct: BuyProduct, history: BuyQuestionMessage[], questionIndex: number) {
    setThinking(true);
    setError("");
    setMessages((previous) => [...previous, { role: "assistant", content: "" }]);

    try {
      const response = await fetch("/api/buy/question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product: nextProduct,
          history,
          questionIndex,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: "question request failed" }));
        throw new Error(data.error || "question request failed");
      }

      await readSseText(response, (chunk) => {
        setMessages((previous) => {
          const copy = [...previous];
          const last = copy[copy.length - 1];
          if (!last || last.role !== "assistant") {
            return previous;
          }
          copy[copy.length - 1] = { ...last, content: last.content + chunk };
          return copy;
        });
      });
    } catch (streamError) {
      setError(streamError instanceof Error ? streamError.message : "failed to ask the next question");
    } finally {
      setThinking(false);
    }
  }

  function beginSession(nextProduct: BuyProduct) {
    setStep("session");
    setProduct(nextProduct);
    setNeedsManualDetails(false);
    setScrapeFailed(false);
    setMessages([]);
    setAnswer("");
    setAnsweredCount(0);
    setVerdict(null);
    setError("");
    void streamQuestion(nextProduct, [], 0);
  }

  async function handleIntakeSubmit(event: FormEvent) {
    event.preventDefault();
    if (!input.trim()) return;
    setIntaking(true);
    setError("");

    try {
      const response = await fetch("/api/buy/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });
      const data = await response.json() as IntakeResponse;

      if (!response.ok || !data.success) {
        throw new Error(data.error || "failed to inspect the purchase");
      }

      setProduct(data.product);
      setManualTitle(data.product.title || "");
      setManualPrice(data.product.price || "");
      setNeedsManualDetails(data.needsManualDetails);
      setScrapeFailed(data.scrapeFailed);

      if (!data.needsManualDetails) {
        beginSession(data.product);
      }
    } catch (intakeError) {
      setError(intakeError instanceof Error ? intakeError.message : "failed to inspect the purchase");
    } finally {
      setIntaking(false);
    }
  }

  function handleManualBegin(event: FormEvent) {
    event.preventDefault();
    if (!manualTitle.trim()) return;

    beginSession({
      ...product,
      title: manualTitle.trim(),
      price: manualPrice.trim() || null,
    });
  }

  async function computeVerdict(transcript: BuyQuestionMessage[]) {
    setThinking(true);
    setError("");

    try {
      const response = await fetch("/api/buy/verdict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product,
          transcript,
        }),
      });
      const data = await response.json() as Partial<VerdictResponse> & { error?: string };
      if (!response.ok || !data.result) {
        throw new Error(data.error || "verdict failed");
      }

      setVerdict({
        result: data.result,
        live: Boolean(data.live),
        model: data.model ?? null,
      });
      setStep("verdict");
    } catch (verdictError) {
      setError(verdictError instanceof Error ? verdictError.message : "verdict failed");
    } finally {
      setThinking(false);
    }
  }

  async function submitAnswer(event: FormEvent) {
    event.preventDefault();
    if (!answer.trim() || thinking) return;

    const nextMessage: BuyQuestionMessage = { role: "user", content: answer.trim() };
    const history = [...messages, nextMessage];
    const nextAnsweredCount = answeredCount + 1;

    setMessages(history);
    setAnswer("");
    setAnsweredCount(nextAnsweredCount);

    if (nextAnsweredCount >= TOTAL_QUESTIONS) {
      await computeVerdict(history);
      return;
    }

    window.setTimeout(() => {
      void streamQuestion(product, history, nextAnsweredCount);
    }, 320);
  }

  return (
    <main className="real-shell" data-surface="buy">
      <SurfaceTopbar surface="buy" actionHref="/demo/buy?scenario=buy-limited-offer" actionLabel="View demo" />

      <section className="surface-hero">
        <div className="eyebrow">Before you buy</div>
        <h1>Make the cart survive a conversation.</h1>
        <p>
          Bring the product or the link. Stayhand pulls it into the light, asks five sharp questions,
          and gives you a verdict when the mood has had a chance to stop pretending it is a plan.
        </p>
        <div className="surface-hero__meta">
          <span className="surface-chip"><strong>flow</strong> intake → five questions → verdict</span>
          <span className="surface-chip"><strong>tone</strong> lower-case, sharp, not theatrical</span>
        </div>
      </section>

      {error && <div className="banner error">{error}</div>}

      {step === "intake" && (
        <div className="real-grid two-up">
          <section className="real-card real-card--accent">
            <div>
              <div className="eyebrow">Bring the item</div>
              <h2>Paste the product link or describe what is in the cart.</h2>
            </div>

            <form className="real-form" onSubmit={handleIntakeSubmit}>
              <label className="real-label">
                Link or description
                <textarea
                  className="real-textarea"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="https://… or describe the thing, the price, and why now"
                />
              </label>
              <button type="submit" className="button primary" disabled={intaking || !input.trim()} style={{ justifyContent: "center" }}>
                {intaking ? "Looking at it…" : "Begin the pause →"}
              </button>
            </form>

            {needsManualDetails && (
              <form className="real-form animate-in" onSubmit={handleManualBegin}>
                <div>
                  <div className="eyebrow">Manual fallback</div>
                  <h3 style={{ marginTop: 4 }}>The page did not give us enough. Tell us yourself.</h3>
                </div>
                <label className="real-label">
                  What is it?
                  <input
                    className="real-input"
                    value={manualTitle}
                    onChange={(event) => setManualTitle(event.target.value)}
                    placeholder="noise-canceling headphones"
                  />
                </label>
                <label className="real-label">
                  Price
                  <input
                    className="real-input"
                    value={manualPrice}
                    onChange={(event) => setManualPrice(event.target.value)}
                    placeholder="$329"
                  />
                </label>
                <button type="submit" className="button primary" disabled={!manualTitle.trim()} style={{ justifyContent: "center" }}>
                  Start questions →
                </button>
              </form>
            )}
          </section>

          <aside className="real-card">
            <div>
              <div className="eyebrow">What happens next</div>
              <h2>The verdict is earned, not guessed.</h2>
            </div>

            <div className="action-grid">
              <article className="action-tile">
                <strong>1. Inspect</strong>
                <span>We pull the store, title, and price when the link gives them up.</span>
              </article>
              <article className="action-tile">
                <strong>2. Interrogate</strong>
                <span>Five questions. Each one a little less comfortable than the last.</span>
              </article>
              <article className="action-tile">
                <strong>3. Verdict</strong>
                <span>Buy, wait 24 hours, or do not buy. With reasons, not vibes.</span>
              </article>
            </div>

            <div className="note">
              <strong>If you want the seeded proof instead</strong>
              <span>Judge mode keeps the same product thesis but on deterministic scenarios.</span>
            </div>

            {scrapeFailed && (
              <div className="note">
                <strong>Best-effort scrape failed</strong>
                <span>That is normal on some stores. Manual entry still keeps the full questioning flow intact.</span>
              </div>
            )}
          </aside>
        </div>
      )}

      {step === "session" && (
        <div className="buy-layout">
          <aside className="reply-sidebar">
            <section className="real-card">
              <div className="row spread">
                <div>
                  <div className="eyebrow">The item</div>
                  <h2>Keep the object in view.</h2>
                </div>
                <button type="button" className="button ghost" onClick={resetAll}>
                  Start over
                </button>
              </div>

              <article className="buy-product-card">
                {product.image ? (
                  <img src={product.image} alt="" />
                ) : (
                  <div style={{ width: 92, height: 92, borderRadius: 14, background: "var(--bg-elevated)" }} />
                )}
                <div>
                  <strong>{product.title}</strong>
                  <p>{product.store || "manual entry"}</p>
                  {product.price && <p style={{ color: "var(--text)", marginTop: 6 }}>{product.price}</p>}
                </div>
              </article>

              <div className="buy-progress">
                {Array.from({ length: TOTAL_QUESTIONS }).map((_, index) => (
                  <span key={index} className={`buy-progress__dot ${index < answeredCount ? "active" : ""}`} />
                ))}
              </div>
              <p className="real-help">question {Math.min(answeredCount + 1, TOTAL_QUESTIONS)} of {TOTAL_QUESTIONS}</p>
            </section>
          </aside>

          <section className="real-card real-card--accent">
            <div>
              <div className="eyebrow">The conversation</div>
              <h2>Five questions between you and the buy button.</h2>
            </div>

            <div className="buy-transcript">
              {messages.map((message, index) => (
                <article
                  key={`${message.role}-${index}-${message.content.slice(0, 12)}`}
                  className={`buy-message ${message.role === "assistant" ? "buy-message--assistant" : "buy-message--user"}`}
                >
                  <p>
                    {message.content}
                    {thinking && message.role === "assistant" && index === messages.length - 1 && !message.content && "thinking…"}
                  </p>
                </article>
              ))}
            </div>

            <form className="real-form" onSubmit={submitAnswer}>
              <label className="real-label">
                Your answer
                <textarea
                  className="real-textarea"
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  placeholder={thinking ? "wait for the next question…" : "answer honestly. enter is not a shortcut here."}
                  disabled={thinking}
                />
              </label>

              <button type="submit" className="button primary" disabled={thinking || !answer.trim()} style={{ justifyContent: "center" }}>
                {thinking ? "Thinking…" : "Send answer →"}
              </button>
            </form>
          </section>
        </div>
      )}

      {step === "verdict" && verdict && (
        <div className="real-grid">
          <div className="row spread">
            <span className="surface-chip">
              <strong>{verdict.live ? "live ai" : "fallback"}</strong>
              {verdict.model || "deterministic"}
            </span>
            <button type="button" className="button ghost" onClick={resetAll}>
              Start over
            </button>
          </div>

          <section className="real-card real-card--accent verdict-receipt">
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
              <div className="row">
                {product.url && (
                  <a className="button ghost" href={product.url} target="_blank" rel="noreferrer">
                    Open original product
                  </a>
                )}
                <button type="button" className="button primary" onClick={resetAll}>
                  Run another purchase
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
