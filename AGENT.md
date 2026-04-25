# AGENT.md

## Product Identity

**Name:** Stayhand
**Tagline:** "The friction you deserve."
**Stance:** Every app makes you act faster. Stayhand makes you act better.

## What It Does

Stayhand helps people avoid regret by adding intentional friction only when risk is high.

Three surfaces:

- **SEND**: pause emotional or risky outbound messages before they leave
- **BUY**: pause pressured or misaligned purchases before checkout
- **REPLY**: pause reactive replies before conflict hardens

Rules detect the risk. AI explains why and helps the user choose better.

## How It Works

1. Deterministic rules evaluate risk signals (emotional language, late-night timing, amount thresholds, urgency patterns, tone mirroring)
2. If risk is high enough, Stayhand inserts a pause
3. AI (Gemini) generates an explanation, a safer alternative, and reflection prompts
4. The user chooses: revise, wait, or continue anyway
5. Every outcome is logged to the ledger with explainability traces

## Route Map

- `/` — landing page with thesis and proof
- `/demo` — scenario picker
- `/demo/send` — send scenario
- `/demo/buy` — buy scenario
- `/demo/reply` — reply scenario
- `/results` — session outcome summary

## Demo Flow (60 seconds)

1. Open `/` — 3 seconds of hero impact
2. Click "Judge demo mode" or "Experience Stayhand"
3. Run SEND → see intervention → use safer version
4. Click Next → run BUY → compare against goals
5. Click Next → run REPLY → cool the tone
6. Open `/results` → unified proof that friction works

## Tech Stack

- Next.js (app router)
- Gemini API (with deterministic fallback)
- SQLite ledger persistence
- Rule-based evaluation engine

## Environment

- `GEMINI_API_KEY` — optional, enables live AI suggestions
- `GEMINI_MODEL` — optional, defaults to gemini-3-flash-preview
- `PORT` — default 4173
- `HOST` — default 127.0.0.1

## Run

```powershell
cd D:\CODE\Hackathon
npm install
npm run dev
```

Default: http://127.0.0.1:4173

## Known Demo Risks

- Without GEMINI_API_KEY, falls back to deterministic suggestions — still demos cleanly
- SQLite uses experimental node:sqlite API (prints warning, works fine)
- All scenarios are seeded and deterministic — not wired to real services
