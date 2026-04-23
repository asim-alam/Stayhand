# AGENT.md

## Product Thesis

Stayhand is no longer positioned as a friction-orchestration console.

The main product story is now:

`Stayhand helps people avoid regret by adding intentional friction only when risk is high.`

Judges should understand the product in under 20 seconds through three scenario-first moments:

- `SEND`: pause heated or risky outbound messages before they leave
- `BUY`: pause pressured or misaligned purchases before checkout completes
- `REPLY`: pause reactive replies before conflict hardens

Rules decide when to trigger friction. AI explains why the pause appeared and improves the next step when a Gemini key is configured.

## Scope Freeze

Must-have scope now shipped:

- polished landing page at `/`
- scenario picker at `/demo`
- full send flow at `/demo/send`
- full buy flow at `/demo/buy`
- full reply flow at `/demo/reply`
- shared intervention card
- explainability drawer
- results page at `/results`
- deterministic reset
- judge demo mode via `?judge=1`
- hidden ops proof at `/ops`

Deliberately demoted behind `/ops`:

- connector management
- plugin registry
- MCP server management
- context bus inspection
- raw queue view
- studio/policy editing
- raw ledger view

Not expanded:

- auth / RBAC
- plugin marketplace polish
- new broad connector support
- production infrastructure work judges will not see

## Route Map

- `/`
  - marketing landing page with thesis and proof framing
- `/demo`
  - scenario picker
- `/demo/send`
  - outbound message friction demo
- `/demo/buy`
  - checkout friction demo
- `/demo/reply`
  - reply friction demo
- `/results`
  - session outcome summary
- `/ops`
  - existing operator console and technical proof surface

Main demo APIs:

- `POST /api/moments/start`
- `POST /api/moments/evaluate`
- `POST /api/moments/revise`
- `POST /api/moments/continue`
- `POST /api/moments/reset`
- `GET /api/results/session`

Legacy runtime/platform APIs remain intact under `/api/runtime`, `/api/context`, `/api/plugins`, `/api/mcp`, and `/api/interventions`.

## Repo Shape

Consumer-facing product:

- `app/(marketing)/page.tsx`
- `app/demo/page.tsx`
- `app/demo/[surface]/page.tsx`
- `app/results/page.tsx`
- `components/demo/`
- `components/shared/`
- `lib/core/`
- `lib/scenarios/`

Technical proof and preserved engine:

- `app/ops/page.tsx`
- `components/ops/operator-console.tsx`
- `components/operator-workspace.tsx`
- `lib/runtime/`
- `lib/context/`
- `lib/mcp/`
- `lib/plugins/`
- `lib/adapters/`
- `lib/friction/`

## Shared Domain Model

Primary demo entities live in `lib/core/types.ts`.

`Moment`
- `id`
- `surface`
- `title`
- `actor`
- `content`
- `context`
- `riskSignals[]`
- `riskScore`
- `confidence`
- `status`

`Assessment`
- `headline`
- `whyNow`
- `interventionType`
- `reasons[]`
- `recommendedActions[]`
- `aiSuggestion`
- `reflectionPrompt`
- `alternativeChoices[]`
- `cooldownSeconds?`

`Outcome`
- `actionTaken`
- `changedOriginal`
- `estimatedValueSaved?`
- `heatReduced?`
- `decisionQualityDelta?`
- `summary`

## Technical Reuse

The product surface is new. The underlying engine is not.

Still reused:

- rule-based evaluation patterns from `lib/friction/evaluator.ts`
- ledger persistence in `lib/runtime/db.ts`
- explainability traces via `createTraceEntry`
- built-in demo adapters and the existing ops runtime
- SQLite-backed proof of outcomes
- SSE runtime stream for `/ops`

New product-layer logic:

- `lib/core/demo-service.ts`
- `lib/core/ai.ts`
- `lib/scenarios/catalog.ts`

The consumer demo intentionally uses simpler language than the ops console, but both live on the same codebase.

## Seed Scenarios

`SEND`
- emotional coworker email
- blunt client follow-up
- late-night apology

`BUY`
- limited-time checkout
- duplicate purchase risk
- expensive purchase that conflicts with goals

`REPLY`
- passive-aggressive coworker thread
- heated group chat reply
- manipulative message needing a boundary

All scenarios are deterministic and load instantly.

## Demo Flow

Recommended judge path:

1. Open `/`
2. Click `Judge demo mode`
3. Run `SEND`
4. Click `Next`
5. Run `BUY`
6. Click `Next`
7. Run `REPLY`
8. Open `/results`
9. Open `/ops` only if asked how it works

The first 90 seconds should stay on the consumer flow. `/ops` is supporting evidence, not the front door.

## Build / Run / Reset

Run locally:

```powershell
cd D:\CODE\Hackathon
npm install
npm run dev
```

Production-style boot:

```powershell
npm run build
node .\server.js
```

Default local URL:

- `http://127.0.0.1:4173`

Environment:

- `GEMINI_API_KEY`
  - optional, enables live AI suggestions
- `GEMINI_MODEL`
  - optional, defaults to `gemini-2.5-flash`
- `PORT`
- `HOST`

Reset the demo session:

- UI reset button inside each scenario
- or `POST /api/moments/reset`

## What Was Cut

Cut from the main demo path:

- runtime-first terminology
- queue-first landing experience
- connector/plugin/MCP surfaces above the fold
- operator-console styling as the public face

Still present, but intentionally secondary:

- connectors
- plugins
- context bus
- MCP
- policies
- raw runtime traces

## Known Demo Risks

- Gemini is optional. Without `GEMINI_API_KEY`, the app falls back to deterministic copy and still demos cleanly.
- SQLite still uses Node’s experimental `node:sqlite` API and prints a warning during build/runtime.
- The consumer demo is deterministic by design; it is not wired to real production inboxes, chats, or checkout SDKs.

## Backup Demo Plan

If live AI is unavailable:

1. Use `Judge demo mode` anyway.
2. Call out that rules trigger the pause deterministically.
3. Point to the `Deterministic fallback` badge on the intervention card.
4. Use `/ops` to prove the runtime, ledger, MCP, queue, and traces are real.
