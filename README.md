# Stayhand

**Every app makes you act faster. Stayhand makes you act better.**

Stayhand adds intentional friction only when risk is high — helping people avoid regret before they send, buy, or reply.

## The Stance

Most products try to remove friction. Stayhand takes the opposite position: **the right friction is protective.**

We don't slow everything down. We slow the moments most likely to create regret.

## Three Surfaces

- **SEND** — catch emotional, risky, or late-night messages before regret leaves your outbox
- **BUY** — slow urgent, duplicate, or misaligned purchases before they become expensive mistakes
- **REPLY** — interpret tone on both sides and offer a safer response before conflict hardens

## How It Works

Rules detect the risk. AI explains why.

- Deterministic signals decide whether friction appears
- AI generates explanations, safer alternatives, and reflection prompts
- The user always keeps control: revise, wait, or continue anyway
- Every outcome is logged with explainability traces

## Run

```powershell
npm install
npm run dev
```

Open http://127.0.0.1:4173

## Environment

Copy `.env.example` to `.env.local`:

- `GEMINI_API_KEY` — optional, enables live AI suggestions
- `GEMINI_MODEL` — optional, defaults to gemini-3-flash-preview

Without an API key, the app uses deterministic fallback suggestions.

## Routes

| Route | Purpose |
|---|---|
| `/` | Landing page |
| `/demo` | Scenario picker |
| `/demo/send` | Send friction demo |
| `/demo/buy` | Buy friction demo |
| `/demo/reply` | Reply friction demo |
| `/results` | Session outcomes |

## Theme: Friction

> "We spent a decade removing friction. Faster payments. Smoother interfaces. Instant everything. Then came the scams, the regret, the messages you can't unsend. Friction was never the villain. It was the guardrail."
