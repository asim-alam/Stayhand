import { $, escapeHtml, postJson, showToast, clamp } from "./ui.js";

const questions = [
  {
    text: "How much did you scroll mindlessly today?",
    chips: ["< 30min", "30-60min", "1-2h", "2h+"],
  },
  {
    text: "Did you make any purchases you regret?",
    chips: ["None", "One small one", "Yes, spent too much", "Did not check"],
  },
  {
    text: "How many messages did you send in haste?",
    chips: ["Zero", "1-2", "Several", "Lost count"],
  },
  {
    text: "Did you do deep focused work today?",
    chips: ["2h+ yes", "About 1h", "< 30min", "Not at all"],
  },
  {
    text: "How many decisions do you wish you paused on?",
    chips: ["None", "1-2", "Many", "Most of them"],
  },
];

export function createLabMode({ ledger }) {
  const state = {
    answers: Array(questions.length).fill(null),
    scores: null,
  };

  const manifest = {
    id: "lab",
    label: "Lab",
    accent: "cyan",
    init() {
      renderQuestions();
      $("#lab-scan-btn").addEventListener("click", runScan);
    },
    reset() {
      state.answers = Array(questions.length).fill(null);
      state.scores = null;
      renderQuestions();
      $("#lab-scan").classList.add("hidden");
      $("#lab-results").classList.add("hidden");
      $("#lab-prescription").innerHTML = "";
      $("#lab-source").textContent = "Instrument idle";
      $("#lab-status").textContent = "Awaiting scan";
      $("#lab-progress-fill").style.width = "0%";
      $("#lab-progress").textContent = "";
    },
    getDemoState() {
      return {
        completedAnswers: state.answers.filter(Boolean).length,
        quotient: state.scores?.quotient || null,
      };
    },
  };

  function renderQuestions() {
    const container = $("#lab-intake");
    container.innerHTML = questions
      .map(
        (question, questionIndex) => `
          <div class="intake-question">
            <div class="intake-q-text">${escapeHtml(question.text)}</div>
            <div class="intake-chips">
              ${question.chips
                .map(
                  (chip, chipIndex) => `
                    <button class="intake-chip ${state.answers[questionIndex] === chip ? "selected" : ""}" data-question="${questionIndex}" data-choice="${chipIndex}">
                      ${escapeHtml(chip)}
                    </button>
                  `
                )
                .join("")}
            </div>
          </div>
        `
      )
      .join("");

    container.querySelectorAll("[data-question]").forEach((button) => {
      button.addEventListener("click", () => {
        const questionIndex = Number(button.dataset.question);
        const chipIndex = Number(button.dataset.choice);
        state.answers[questionIndex] = questions[questionIndex].chips[chipIndex];
        renderQuestions();
      });
    });
  }

  async function runScan() {
    if (state.answers.some((answer) => !answer)) {
      showToast("Complete all five intake questions before running the scan.", "warning");
      return;
    }

    state.scores = buildScores(state.answers);
    $("#lab-scan").classList.remove("hidden");
    $("#lab-results").classList.add("hidden");
    $("#lab-source").textContent = "Scanning...";

    const statuses = ["Analyzing friction patterns...", "Classifying events...", "Generating MRI..."];
    const statusNode = $("#lab-status");
    const fill = $("#lab-progress-fill");
    const progress = $("#lab-progress");
    const scanLine = $("#lab-scan-line");
    scanLine.classList.remove("hidden");

    for (let step = 0; step < statuses.length; step += 1) {
      statusNode.textContent = statuses[step];
      const pct = Math.round(((step + 1) / statuses.length) * 100);
      fill.style.width = `${pct}%`;
      progress.textContent = `${pct}%`;
      // Keep the scan deterministic and calm.
      // eslint-disable-next-line no-await-in-loop
      await wait(850);
    }

    scanLine.classList.add("hidden");
    drawMRI($("#lab-mri-canvas"), state.scores);
    await renderPrescription();
  }

  async function renderPrescription() {
    const payload = {
      answers: questions.map((question, index) => ({
        question: question.text,
        choice: state.answers[index],
      })),
      scores: state.scores,
    };

    let result;
    try {
      result = await postJson("/api/gemini/lab", payload);
    } catch {
      result = fallbackPrescription(state.scores);
    }

    $("#lab-source").textContent = result.source === "gemini" ? "Live AI prescription" : "Deterministic fallback";
    $("#lab-results").classList.remove("hidden");
    $("#lab-prescription").innerHTML = `
      <div class="prescription-card stamp-in">
        <div class="prescription-header">RX - FRICTION PRESCRIPTION</div>
        <div class="archetype-card">
          <div class="archetype-name">${escapeHtml(String(result.archetype || "").toUpperCase())}</div>
          <div class="archetype-desc">${escapeHtml(result.archetypeDesc || "")}</div>
          <div class="mt-4 text-lg font-mono">Friction Quotient ${result.quotient}/100</div>
        </div>
        <div class="prescription-rx mt-6">Three surgical pauses for next week.</div>
        <div class="prescription-items">
          ${result.prescriptions
            .map(
              (item) => `
                <div class="prescription-item">
                  <div>${escapeHtml(item.icon)}</div>
                  <div>
                    <strong>${escapeHtml(item.title)}</strong>
                    <div>${escapeHtml(item.detail)}</div>
                  </div>
                </div>
              `
            )
            .join("")}
        </div>
        <div class="stack-actions mt-6">
          <button id="lab-share" class="btn btn-ghost">Copy prescription summary</button>
        </div>
        <div class="prescription-stamp">L</div>
      </div>
    `;

    $("#lab-share").addEventListener("click", async () => {
      const text = `${result.archetype}: ${result.prescriptions.map((item) => `${item.title} - ${item.detail}`).join(" | ")}`;
      try {
        await navigator.clipboard.writeText(text);
        showToast("Prescription copied to clipboard.", "success");
      } catch {
        showToast("Clipboard copy unavailable in this browser.", "warning");
      }
    });

    ledger.add({
      mode: "lab",
      outcome: "scanned",
      label: "Friction MRI completed",
      quotient: result.quotient,
      meta: { archetype: String(result.archetype || "").toUpperCase() },
    });
    showToast("Friction prescription generated.", "success");
  }

  return manifest;
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function buildScores(answers) {
  const severity = answers.map((answer, questionIndex) => questions[questionIndex].chips.indexOf(answer));
  const healing = clamp(100 - severity[3] * 22 - severity[4] * 10, 10, 100);
  const numbing = clamp(severity[0] * 18 + severity[1] * 16 + severity[2] * 14, 0, 100);
  const missing = clamp(severity[4] * 22 + severity[3] * 10, 0, 100);
  const quotient = clamp(Math.round((healing * 1.15 - numbing * 0.8 + (100 - missing) * 0.35) / 1.3), 0, 100);

  return {
    quotient,
    healing,
    numbing,
    missing,
    healingSeries: [42, 52, 58, healing, 62, 57],
    numbingSeries: [numbing - 8, numbing, numbing + 6, numbing - 4, numbing + 5, numbing - 3].map((value) =>
      clamp(value, 4, 100)
    ),
    missingSeries: [missing + 4, missing - 6, missing, missing + 5, missing - 8, missing + 2].map((value) =>
      clamp(value, 4, 100)
    ),
  };
}

function drawMRI(canvas, scores) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = "#141420";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i += 1) {
    const y = 24 + ((height - 48) / 5) * i;
    ctx.beginPath();
    ctx.moveTo(40, y);
    ctx.lineTo(width - 20, y);
    ctx.stroke();
  }

  drawSeries(ctx, scores.healingSeries, width, height, "#2E9B6A", "rgba(46,155,106,0.16)");
  drawSeries(ctx, scores.numbingSeries, width, height, "#E76F51", "rgba(231,111,81,0.16)");
  drawSeries(ctx, scores.missingSeries, width, height, "#E8A24A", "rgba(232,162,74,0.12)", [8, 8]);
}

function drawSeries(ctx, series, width, height, strokeStyle, fillStyle, dash = []) {
  const left = 40;
  const right = width - 20;
  const top = 24;
  const bottom = height - 24;
  const step = (right - left) / Math.max(1, series.length - 1);

  ctx.beginPath();
  series.forEach((value, index) => {
    const x = left + step * index;
    const y = bottom - (value / 100) * (bottom - top);
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.lineTo(right, bottom);
  ctx.lineTo(left, bottom);
  ctx.closePath();
  ctx.fillStyle = fillStyle;
  ctx.fill();

  ctx.beginPath();
  series.forEach((value, index) => {
    const x = left + step * index;
    const y = bottom - (value / 100) * (bottom - top);
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.setLineDash(dash);
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.setLineDash([]);
}

function fallbackPrescription(scores) {
  const quotient = scores.quotient;
  const archetype = quotient < 35 ? "The Smoother" : quotient < 60 ? "The Drifter" : quotient < 80 ? "The Forge" : "The Resister";
  const descriptions = {
    "The Smoother": "You remove friction so aggressively that risky moments pass without enough scrutiny.",
    "The Drifter": "Your day keeps slipping from intention into autopilot; visible boundaries would help.",
    "The Forge": "You already benefit from some useful friction and can turn it into a stronger ritual.",
    "The Resister": "You tolerate healthy resistance well; your next step is making it deliberate instead of accidental.",
  };

  return {
    source: "fallback",
    archetype,
    archetypeDesc: descriptions[archetype],
    quotient,
    prescriptions: [
      {
        icon: "[]",
        title: "24-hour purchase hold",
        detail: "Delay any emotional or urgent spend over $30 until the next day.",
      },
      {
        icon: "[]",
        title: "Draft before send",
        detail: "Route heated messages into a short cooldown state before they leave your screen.",
      },
      {
        icon: "[]",
        title: "Visible pause ritual",
        detail: "Add one physical action before your riskiest tap: stand up, breathe, or write one line first.",
      },
    ],
  };
}
