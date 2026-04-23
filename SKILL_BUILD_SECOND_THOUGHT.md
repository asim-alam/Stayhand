# SKILL: Build "Second Thought" — Hackathon Winner

## PROJECT IDENTITY
- **Name:** Second Thought
- **Tagline:** "The friction you deserve."
- **Stance:** Friction isn't the enemy. Regret is.
- **Gemini API Key:** Set `GEMINI_API_KEY` in `.env` for the local Node proxy. Do not hardcode secrets in markdown or client code.
- **Output:** `d:\CODE\Hackathon\index.html` (single file app)

## TECH STACK
- Pure HTML + CSS + Vanilla JS (no frameworks, no build tools)
- Google Fonts CDN: Space Grotesk, Inter, JetBrains Mono, Instrument Serif
- Lucide Icons CDN
- Gemini API via fetch (model: gemini-2.0-flash)
- All state in localStorage

## COLOR SYSTEM
```
--bg-void:     #0B0B0F   (main background)
--bg-surface:  #141420   (cards)
--bg-elevated: #1C1C2E   (modals)
--amber:       #E8A24A   (think/friction — primary accent)
--coral:       #E76F51   (danger/high-risk)
--sage:        #2E9B6A   (safe/healing/kindness)
--cyan:        #22D3EE   (diagnostic/lab)
--indigo:      #6366F1   (creative/quarry)
--text:        #F0EDE8   (warm off-white)
--muted:       #64748B
```

## PAGE STRUCTURE (single index.html)

```
<nav>          Logo | Shield | Kiln | Quarry | Lab | Ledger Score
<section#hero> Particle canvas bg | Hero headline | 4 mode CTA buttons
<section#stats> 4 animated counters: $5,400 | 95min | 340% | 2.5sec
<section#demo> Tab switcher → 4 mode panels (Shield/Kiln/Quarry/Lab)
<section#ledger> Unified stats dashboard + history feed
<section#manifesto> Serif quote + rotating axioms
<footer>
```

---

## MODE 1: SHIELD (Financial Friction)
**Color:** coral `#E76F51`

### UI Layout (2-column grid)
- **Left:** Scenario selector cards
  - Card 1: "Urgent Bank Alert" — scam transfer scenario
  - Card 2: "Flash Sale Checkout" — impulse purchase scenario
- **Right:** Simulated transfer/payment form

### Transfer Form Fields
- Recipient (pre-filled: "BankSecure-Verify@gmail.com")
- Amount (pre-filled: $2,500)
- Message (pre-filled: "URGENT: Account verification required")
- [Send Money →] button

### Risk Engine (deterministic JS rules)
```js
function evaluateRisk(data) {
  let score = 0;
  const reasons = [];
  if (data.recipient.includes('gmail') || data.recipient.includes('yahoo')) {
    score += 35; reasons.push({icon:'⚠️', text:'Unknown/personal email recipient'});
  }
  if (data.message.match(/urgent|verify|immediate|suspended/i)) {
    score += 30; reasons.push({icon:'🚨', text:'Urgency language detected'});
  }
  if (data.amount > 1000) {
    score += 20; reasons.push({icon:'💸', text:'High-value irreversible transfer'});
  }
  // score 0-30=T0, 31-50=T1, 51-75=T2, 76+=T3
  return { score, reasons, tier: score>75?3:score>50?2:score>30?1:0 };
}
```

### Friction Tiers
- **T0:** Pass through (no friction)
- **T1:** Amber warning banner below button
- **T2:** Modal with 10s countdown before "Proceed anyway"
- **T3:** Full intervention modal (coral glow, danger pulse)

### Intervention Modal (T3)
```
[🛡️ Second Thought]        RISK SCORE: 85/100
━━━━━━━━━━━━━━━━━━━━━━━━━━━━ [████████▓░] T3
[⚠️] Unknown/personal email recipient
[🚨] Urgency language detected
[💸] High-value irreversible transfer

"This transfer matches patterns common in urgency scams.
 Once sent, it cannot be recovered."

[10s countdown ring — animated SVG]

[✕ Cancel Transfer]          ← primary (sage)
[📞 Call Official Bank]      ← secondary (ghost)
[→ Proceed Anyway]           ← tertiary (muted, enabled after countdown)
```

### On Cancel → Dashboard Update
```js
ledger.add({ mode:'shield', outcome:'cancelled', saved: amount, label: 'Scam transfer blocked' });
showToast('💚 $2,500 protected');
```

---

## MODE 2: KILN (Communication Friction)
**Color:** amber `#E8A24A`

### UI Layout (2-column grid)
- **Left:** Message composer
- **Right:** Steel-man panel + Cooling drawer

### Message Composer
```html
<div class="heat-display">
  HEAT SCORE: <span id="heat-value">0</span>/100
  [████░░░░░░] animated bar
</div>
<textarea id="message-input" placeholder="Type your message..."></textarea>
<button id="send-btn">Send Message</button>
```

### Heat Scoring (Gemini API)
On debounced input (500ms delay):
```js
async function scoreHeat(text) {
  if (text.length < 10) return { heat: 0, category: 'neutral', softened: '' };
  const res = await callGemini(`
    Rate this message 0-100 for emotional heat/harm potential.
    Return JSON: {"heat": number, "category": "neutral"|"warm"|"hot"|"apology", "softened": "rewritten calmer version or empty string"}
    Message: "${text}"
  `);
  return JSON.parse(res);
}
```

### Heat Thresholds → UI State
```
0-30:  neutral  → button: normal grey, label "Send"
31-60: warm     → button: amber tint, heat-pulse animation
61-85: hot      → button: coral tint, danger-pulse, show steel-man
86+:   critical → button: disabled + hold-to-send (2s hold required), show cooling drawer
```

### Send Button Weight (CSS transform)
```js
// Apply physical weight via CSS transform
sendBtn.style.transform = `translateY(${heat * 0.02}px) scale(${1 - heat*0.001})`;
sendBtn.style.fontWeight = Math.round(400 + heat * 4);
```

### Steel-Man Panel (visible at heat > 60)
```
[⚖️ STRONGEST CASE AGAINST SENDING]
{AI-generated steel-man argument}
[Send Original (heavy)] [Send Softened (light)]
```

### Cooling Drawer (visible at heat > 85)
Messages slide in with 30s countdown. Editable. Cancellable.

### Apology Fast Lane
If category === 'apology': skip all friction, green halo animation, instant send.

### On Send → Ledger
```js
if (heat > 60) ledger.add({ mode:'kiln', outcome: userChoice, heat, label: 'Message reviewed' });
```

---

## MODE 3: QUARRY (Creative Friction)
**Color:** indigo `#6366F1`

### UI Layout (stacked)
1. Intent input box
2. AI Socratic questions (3 cards, appear sequentially)
3. Answer fields
4. 3 opposing draft cards to choose from

### Intent Input
```html
<div class="quarry-intent">
  <label>What do you want to create?</label>
  <input id="quarry-intent" placeholder='e.g. "Write a LinkedIn post about our launch"' />
  <button id="quarry-start">Interrogate My Thinking →</button>
</div>
```

### Step 1: AI refuses to draft immediately
```js
async function generateQuestions(intent) {
  return await callGemini(`
    You are a Socratic AI. The user wants to: "${intent}"
    REFUSE to write anything. Instead generate exactly 3 sharp questions
    that force them to clarify their thinking.
    Return JSON: {"questions": ["q1","q2","q3"]}
    Make questions specific, provocative, and impossible to answer with one word.
  `);
}
```

### Questions Display
3 cards appear with staggered animation (0.1s, 0.25s, 0.4s delays):
```
[Q1] "Who specifically is this for? What would make them stop scrolling?"
[answer textarea]

[Q2] "What's the honest version you'd be embarrassed to post?"
[answer textarea]

[Q3] "What changes if someone reads this 6 months from now?"
[answer textarea]
```

### Step 2: Generate 3 Opposing Drafts
After user answers all 3:
```js
async function generateDrafts(intent, answers) {
  return await callGemini(`
    Based on intent: "${intent}" and answers: ${JSON.stringify(answers)}
    Write exactly 3 DELIBERATELY DIFFERENT drafts labeled:
    - "Direct" (blunt, no fluff)
    - "Provocative" (challenges assumptions)  
    - "Vulnerable" (honest, personal)
    Return JSON: {"drafts": [{"label":"Direct","text":"..."},{"label":"Provocative","text":"..."},{"label":"Vulnerable","text":"..."}]}
  `);
}
```

### Drafts UI
3 cards side by side. User picks one. Then optional "Polish selected" button.

### Ledger
```js
ledger.add({ mode:'quarry', outcome:'completed', label: `Interrogated: ${intent.slice(0,40)}` });
```

---

## MODE 4: LAB (Diagnostic Friction)
**Color:** cyan `#22D3EE`

### UI Flow: 3 phases
1. **Intake** — clinical AI questionnaire (5 questions with chip answers)
2. **Scan** — animated scanline + MRI chart renders
3. **Prescription** — personalized friction prescriptions

### Phase 1: Intake Questions
Hardcoded questions with chip options:
```js
const questions = [
  { text: "How much did you scroll mindlessly today?", chips: ["< 30min","30-60min","1-2h","2h+"] },
  { text: "Did you make any purchases you regret?", chips: ["None","One small one","Yes, spent too much","Didn't check"] },
  { text: "How many messages did you send in anger/haste?", chips: ["Zero","1-2","Several","Lost count"] },
  { text: "Did you do deep focused work today?", chips: ["2h+ yes","About 1h","< 30min","Not at all"] },
  { text: "How many decisions do you wish you'd paused on?", chips: ["None","1-2","Many","Most of them"] },
];
```

### Phase 2: Scan Animation
```
Progress bar fills over 2.5s
Scanline sweeps L→R across a mock timeline div
Text: "Analyzing friction patterns..." → "Classifying events..." → "Generating MRI..."
```

### Phase 2b: MRI Chart (Canvas)
Draw on `<canvas id="mri-canvas">`:
```js
function drawMRI(canvas, data) {
  // X axis = time (8am-midnight), Y axis = friction coefficient 0-100
  // Zones colored:
  // HEALING (green): deep work, paused decisions  
  // NUMBING (red): scrolling, regret purchases, rash messages
  // MISSING (amber): gaps where friction should exist
  // Draw smooth area chart with gradient fills
  // Add labeled data points with pulsing circles
}
```

### Phase 3: Prescription Card
AI-generated, printed-receipt style:
```js
async function generatePrescription(intakeData) {
  return await callGemini(`
    Based on this person's day: ${JSON.stringify(intakeData)}
    You are "The Instrument" — a calm clinical AI.
    Generate a Friction Prescription with:
    1. Their Friction Archetype (one of: Smoother, Resister, Drifter, Forge)
    2. Friction Quotient score (0-100, ratio of healing to numbing)
    3. Exactly 3 surgical friction prescriptions for next week
    Return JSON: {
      "archetype": "...",
      "archetypeDesc": "one sentence",
      "quotient": number,
      "prescriptions": [{"icon":"emoji","title":"...","detail":"..."}]
    }
  `);
}
```

### Prescription Card HTML
```
╔══════════════════════════════════════╗
║  Rx  FRICTION PRESCRIPTION           ║
║  The Instrument · Second Thought     ║
║  ————————————————————————————————————║
║  Archetype: THE SMOOTHER             ║
║  Friction Quotient: 28/100           ║
║                                      ║
║  Prescription:                       ║
║  ⏳ 24h wait before purchases >$30   ║
║  📵 Phone in drawer during meals     ║
║  ✍️  Write before you send           ║
║                               [🔬]   ║
╚══════════════════════════════════════╝
[📋 Share Prescription]
```

---

## UNIFIED LEDGER
```js
// localStorage key: 'st_ledger'
const ledger = {
  add(entry) {
    const entries = this.getAll();
    entries.unshift({ ...entry, id: Date.now(), ts: new Date().toISOString() });
    localStorage.setItem('st_ledger', JSON.stringify(entries.slice(0, 100)));
    this.updateUI();
  },
  getAll() { return JSON.parse(localStorage.getItem('st_ledger') || '[]'); },
  getStats() {
    const all = this.getAll();
    return {
      shieldSaved: all.filter(e=>e.mode==='shield'&&e.outcome==='cancelled').reduce((s,e)=>s+(e.saved||0),0),
      kiltCooled:  all.filter(e=>e.mode==='kiln'&&e.heat>60).length,
      quarryDone:  all.filter(e=>e.mode==='quarry').length,
      labScans:    all.filter(e=>e.mode==='lab').length,
      total:       all.length,
    };
  }
};
```

### Ledger Dashboard UI
```
╔═══════════╦═══════════╦═══════════╗
║  $5,250   ║    12     ║    8      ║
║  Protected║ Messages  ║  Drafts   ║
║           ║  Cooled   ║  Earned   ║
╠═══════════╬═══════════╬═══════════╣
║    3      ║   28/100  ║  SMOOTHER ║
║  Lab Scans║ Avg FQ    ║ Archetype ║
╚═══════════╩═══════════╩═══════════╝
[History feed — last 10 events, animated]
```

---

## GEMINI API INTEGRATION
```js
const GEMINI_URL = '/api/gemini/...'; // Server-side proxy uses process.env.GEMINI_API_KEY

async function callGemini(prompt) {
  try {
    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
      })
    });
    const data = await res.json();
    return data.candidates[0].content.parts[0].text;
  } catch(e) {
    console.error('Gemini error:', e);
    return null;
  }
}

// Helper: parse JSON from AI response (strips markdown code fences)
function parseAI(text) {
  if (!text) return null;
  const match = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/({[\s\S]*})/);
  try { return JSON.parse(match ? match[1] : text); } catch { return null; }
}
```

---

## PARTICLE BACKGROUND (Hero)
```js
function initParticles(canvas) {
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const particles = Array.from({length: 60}, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    r: Math.random() * 1.5 + 0.5,
    dx: (Math.random() - 0.5) * 0.3,
    dy: (Math.random() - 0.5) * 0.3,
    opacity: Math.random() * 0.4 + 0.1,
  }));
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(232, 162, 74, ${p.opacity})`;
      ctx.fill();
      p.x += p.dx; p.y += p.dy;
      if (p.x < 0 || p.x > canvas.width) p.dx *= -1;
      if (p.y < 0 || p.y > canvas.height) p.dy *= -1;
    });
    requestAnimationFrame(draw);
  }
  draw();
}
```

---

## MRI CANVAS DRAWING
```js
function drawMRI(canvas, scores) {
  // scores = { healing: [points], numbing: [points], missing: [points] }
  // healing points: {x: 0-1, y: 0-1} mapped to canvas coords
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  // Draw grid lines (hairline, #ffffff10)
  // Draw X-axis labels (8am → midnight)
  // Draw Y-axis labels (0 → 100)

  // For each zone, draw filled area with gradient:
  // healing: rgba(46,155,106,0.3) fill, #2E9B6A stroke
  // numbing:  rgba(231,111,81,0.3) fill,  #E76F51 stroke
  // missing:  rgba(232,162,74,0.2) fill, #E8A24A stroke dashed

  // Pulsing data points: small circles at each data point
  // Animate with requestAnimationFrame for breathing effect
}
```

---

## COUNTDOWN SVG RING
```js
function createCountdownRing(container, seconds, color, onComplete) {
  const svg = `
    <svg width="96" height="96" viewBox="0 0 96 96">
      <circle cx="48" cy="48" r="42" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="6"/>
      <circle cx="48" cy="48" r="42" fill="none" stroke="${color}" stroke-width="6"
        stroke-dasharray="264" stroke-dashoffset="0"
        stroke-linecap="round" transform="rotate(-90 48 48)"
        id="ring-fill"/>
    </svg>
    <span id="ring-num" style="position:absolute;font-family:monospace;font-size:24px;color:${color};top:50%;left:50%;transform:translate(-50%,-50%)">${seconds}</span>
  `;
  container.innerHTML = svg;
  let left = seconds;
  const interval = setInterval(() => {
    left--;
    document.getElementById('ring-num').textContent = left;
    const offset = 264 * (left / seconds);
    document.getElementById('ring-fill').style.strokeDashoffset = offset;
    if (left <= 0) { clearInterval(interval); onComplete(); }
  }, 1000);
  return interval;
}
```

---

## NAVIGATION BEHAVIOR
```js
// Active mode tracking
let activeMode = 'shield';
function setMode(mode) {
  activeMode = mode;
  // Update nav pills active class
  // Scroll to #demo section
  // Activate correct demo tab
  document.querySelectorAll('.demo-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
  document.querySelectorAll('.demo-panel').forEach(p => p.classList.toggle('active', p.id === `panel-${mode}`));
}

// Scroll spy
const observer = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      document.querySelectorAll('.nav-link').forEach(l =>
        l.classList.toggle('active', l.dataset.section === e.target.id));
    }
  });
}, { threshold: 0.3 });
['hero','stats','demo','ledger','manifesto'].forEach(id => {
  const el = document.getElementById(id);
  if (el) observer.observe(el);
});
```

---

## ANIMATED STAT COUNTERS
```js
function animateCounter(el, target, prefix='', suffix='', duration=2000) {
  const start = performance.now();
  const update = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 4);
    el.textContent = prefix + Math.round(ease * target).toLocaleString() + suffix;
    if (progress < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}
// Trigger when #stats enters viewport
// $5,400  |  95min  |  340%  |  2.5sec
```

---

## TOAST SYSTEM
```js
function showToast(message, type='success', duration=4000) {
  const icons = { success:'💚', warning:'⚠️', info:'ℹ️', error:'🛡️' };
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span>${icons[type]}</span><span>${message}</span>`;
  document.getElementById('toast-container').appendChild(toast);
  setTimeout(() => { toast.classList.add('toast-out'); setTimeout(() => toast.remove(), 300); }, duration);
}
```

---

## MANIFESTO AXIOMS (rotating)
```js
const axioms = [
  '"Smoothness is a sedative."',
  '"A pause is a small refusal."',
  '"Speed is a tax on judgment."',
  '"The best interfaces resist you — just enough."',
  '"Friction is care, designed into the interface."',
  '"Not every tap deserves to be instant."',
  '"The absence of friction is now the problem."',
  '"We built the fastest internet and filled it with regret."',
  '"Good friction protects. Bad friction frustrates. Learn the difference."',
  '"Slow the risky stuff. Keep the rest flowing."',
];
// Rotate featured axiom every 4 seconds with fade transition
```

---

## HERO SECTION CONTENT
```html
<div class="hero-eyebrow">⏸ A position on friction</div>
<h1>
  The Internet Was Designed<br>
  To Be <span class="strike">Frictionless</span>.<br>
  <span class="accent">That's The Problem.</span>
</h1>
<p>We spent a decade removing friction. Faster payments. Smoother interfaces. 
   Instant everything. Then came the scams, the regret, the scrolling that 
   never stops. Second Thought puts friction back — beautifully, intelligently, 
   exactly where it earns its keep.</p>
<div class="hero-actions">
  <button onclick="setMode('shield')">🛡️ Try Shield Mode</button>
  <button onclick="setMode('kiln')">🔥 Try Kiln Mode</button>
  <button onclick="scrollTo('#manifesto')">Read the Stance →</button>
</div>
```

---

## FILE STRUCTURE TO CREATE
```
d:\CODE\Hackathon\
├── index.html          ← Complete SPA (all modes, all JS inline or linked)
├── css/
│   ├── design-system.css   ← DONE (variables, tokens, utilities)
│   ├── layout.css          ← DONE (nav, sections, hero, responsive)
│   ├── animations.css      ← DONE (all keyframes)
│   └── modes.css           ← DONE (mode-specific components)
├── js/
│   ├── app.js          ← Navigation, init, scroll spy, counters
│   ├── engine.js       ← Risk scorer, timer, ledger
│   ├── ai.js           ← Gemini API calls
│   ├── shield.js       ← Shield mode logic
│   ├── kiln.js         ← Kiln mode logic (heat scoring)
│   ├── quarry.js       ← Quarry mode logic (Socratic AI)
│   ├── lab.js          ← Lab mode logic (intake, MRI, prescription)
│   ├── particles.js    ← Canvas particle system
│   └── mri.js          ← MRI canvas chart
├── AGENT.md
└── README.md
```

---

## BUILD ORDER
1. `index.html` — full page structure with all sections, link all CSS/JS
2. `js/ai.js` — Gemini API helper first (everything depends on it)
3. `js/engine.js` — Risk scorer + Ledger (Shield/Kiln depend on it)
4. `js/shield.js` — Hero demo mode (most important for judges)
5. `js/kiln.js` — Second most impactful demo
6. `js/quarry.js` — AI creative mode
7. `js/lab.js` — Diagnostic mode
8. `js/particles.js` + `js/mri.js` — Visual polish
9. `js/app.js` — Wire everything together, nav, counters, axioms

---

## AGENT OPERATING RULES
1. Build each JS file independently — they communicate only through `window.ledger` and `window.secondThought`
2. All AI calls must have fallback static data for demo stability
3. Never rely on AI for binary decisions — rules engine decides, AI explains
4. Seed the ledger with realistic demo data on first load if empty
5. Every friction intervention must have: title, reason chips, countdown if T2+, clear cancel path
6. Test the full demo script after each mode: Shield → Kiln → Lab → show Ledger
7. Update `AGENT.md` after each file is completed
