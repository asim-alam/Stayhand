# Stayhand

Stayhand is a consumer-facing hackathon demo about friction.

It helps people avoid regret by adding intentional friction only when risk is high.

The product is shown through three fast scenarios:

- `SEND`: catch emotional or risky outbound messages before send
- `BUY`: slow pressured or misaligned purchases before checkout
- `REPLY`: calm reactive replies before they harden conflict

Under the hood, the app still runs on the existing technical engine: seeded adapters, rule-based evaluation, explainability traces, SQLite ledger persistence, SSE updates, and an ops console judges can inspect if they ask.

## Why This Wins The Theme

Most products try to remove friction.

Stayhand takes the opposite position:

`The right friction is protective.`

We do not slow everything down. We slow the moments most likely to create regret.

## Routes

- `/`
  - product landing page
- `/demo`
  - scenario picker
- `/demo/send`
  - send scenario
- `/demo/buy`
  - buy scenario
- `/demo/reply`
  - reply scenario
- `/results`
  - session outcomes
- `/ops`
  - technical proof surface

## Run

```powershell
cd D:\CODE\Hackathon
npm install
npm run dev
```

Default URL:

- `http://127.0.0.1:4173`

Production-style:

```powershell
npm run build
node .\server.js
```

## Environment

Create a local `.env` from `.env.example`.

- `GEMINI_API_KEY`
  - optional; enables live AI suggestions
- `GEMINI_MODEL`
  - optional; defaults to `gemini-2.5-flash`
- `PORT`
- `HOST`

Without `GEMINI_API_KEY`, the app still works using deterministic fallback suggestions.

## Demo Contract

Rules trigger the pause.

AI improves the next step.

That means:

- deterministic risk signals decide whether friction should appear
- the app does not over-agentize simple triggers
- AI is used for explanation, rewrite quality, reflection prompts, and alternatives
- the demo remains stable even if the model key is missing

## Main API Surface

- `POST /api/moments/start`
- `POST /api/moments/evaluate`
- `POST /api/moments/revise`
- `POST /api/moments/continue`
- `POST /api/moments/reset`
- `GET /api/results/session`

The older runtime, MCP, plugin, context, and intervention APIs are still present for `/ops`.

## Verification

Baseline checks:

```powershell
npm exec tsc --noEmit
npm run build
```

Then verify:

- `/`
- `/demo`
- `/demo/send`
- `/demo/buy`
- `/demo/reply`
- `/results`
- `/ops`
- `POST /api/moments/start`
- `POST /api/moments/revise`
- `POST /api/moments/continue`
- `GET /api/results/session`

## Notes

- Local persistence uses Node 22 `node:sqlite`, which still prints an experimental warning.
- `/ops` exists to prove the system is real, but it is not the main story anymore.
- Seed scenarios are deterministic so the judge demo does not depend on brittle external services.
