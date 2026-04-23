import { $, escapeHtml, createCountdownRing, formatCurrency, showToast, clamp } from "./ui.js";

const scenarios = [
  {
    id: "urgent-bank",
    title: "Urgent Bank Alert",
    description: "Fake verification request with urgency language and a personal recipient.",
    recipient: "BankSecure-Verify@gmail.com",
    amount: 2500,
    message: "URGENT: Your account is suspended. Transfer now to verify and avoid a permanent freeze.",
  },
  {
    id: "flash-sale",
    title: "Flash Sale Checkout",
    description: "Late-night impulse purchase with scarcity pressure and a questionable checkout path.",
    recipient: "checkout@flashdrop.shop",
    amount: 199,
    message: "LAST CHANCE. One click locks your deal before midnight. Buy now or miss it forever.",
  },
];

export function createShieldMode({ ledger }) {
  const state = {
    scenarioId: scenarios[0].id,
    countdownCleanup: null,
    latestRisk: null,
  };

  const manifest = {
    id: "shield",
    label: "Shield",
    accent: "coral",
    init() {
      renderScenarioCards();
      applyScenario(scenarios[0]);
      bindForm();
      updatePreview();
    },
    reset() {
      const first = scenarios[0];
      state.scenarioId = first.id;
      applyScenario(first);
      hideOverlay();
      updatePreview();
    },
    getDemoState() {
      return {
        activeScenario: state.scenarioId,
        risk: state.latestRisk,
      };
    },
  };

  function renderScenarioCards() {
    const container = $("#shield-scenarios");
    container.innerHTML = scenarios
      .map(
        (scenario) => `
          <button class="scenario-card ${scenario.id === state.scenarioId ? "selected" : ""}" data-scenario="${scenario.id}">
            <div class="scenario-title">${escapeHtml(scenario.title)}</div>
            <div class="scenario-desc">${escapeHtml(scenario.description)}</div>
          </button>
        `
      )
      .join("");

    container.querySelectorAll("[data-scenario]").forEach((button) => {
      button.addEventListener("click", () => {
        const next = scenarios.find((scenario) => scenario.id === button.dataset.scenario);
        if (!next) {
          return;
        }
        state.scenarioId = next.id;
        renderScenarioCards();
        applyScenario(next);
        hideOverlay();
        updatePreview();
      });
    });
  }

  function bindForm() {
    ["#shield-recipient", "#shield-amount", "#shield-message"].forEach((selector) => {
      $(selector).addEventListener("input", updatePreview);
    });

    $("#shield-send").addEventListener("click", () => {
      const risk = evaluateRisk(getFormData());
      state.latestRisk = risk;
      updatePreview();

      if (risk.tier >= 2) {
        showOverlay(risk);
        return;
      }

      ledger.add({
        mode: "shield",
        outcome: "proceeded",
        label: `Transfer sent to ${getFormData().recipient}`,
        saved: 0,
        meta: { tier: risk.tier, score: risk.score },
      });
      showToast("Transfer proceeded without intervention.", "warning");
    });
  }

  function getFormData() {
    return {
      recipient: $("#shield-recipient").value.trim(),
      amount: Number($("#shield-amount").value || 0),
      message: $("#shield-message").value.trim(),
    };
  }

  function applyScenario(scenario) {
    $("#shield-recipient").value = scenario.recipient;
    $("#shield-amount").value = String(scenario.amount);
    $("#shield-message").value = scenario.message;
  }

  function updatePreview() {
    const preview = $("#shield-risk-preview");
    const risk = evaluateRisk(getFormData());
    state.latestRisk = risk;
    const tierLabel = `T${risk.tier}`;
    preview.classList.add("visible");
    preview.innerHTML = `
      Risk score <strong>${risk.score}/100</strong> - ${tierLabel}
      <div class="risk-chip-list">
        ${risk.reasons.map((reason) => `<span class="risk-chip">${escapeHtml(reason)}</span>`).join("")}
      </div>
    `;
  }

  function showOverlay(risk) {
    hideOverlay();
    const overlay = $("#shield-overlay");
    const formData = getFormData();
    overlay.classList.remove("hidden");
    overlay.innerHTML = `
      <div class="intervention-card friction-entrance">
        <div class="intervention-header">
          <div class="intervention-icon">S</div>
          <div>
            <div class="intervention-title">Second Thought triggered</div>
            <div class="intervention-subtitle">Risk score ${risk.score}/100 - Tier ${risk.tier}</div>
          </div>
        </div>
        <div class="risk-score-bar">
          <div class="risk-bar-fill" style="width:${risk.score}%; background:${risk.tier >= 3 ? "#E76F51" : "#E8A24A"}"></div>
        </div>
        <div class="friction-reasons">
          ${risk.reasons
            .map(
              (reason) => `
                <div class="friction-reason">
                  <div class="friction-reason-icon">!</div>
                  <div>${escapeHtml(reason)}</div>
                </div>
              `
            )
            .join("")}
        </div>
        <p class="intervention-copy">
          This flow matches patterns common in urgency scams and impulse traps. Once this leaves your account, recovery is unlikely.
        </p>
        <div id="shield-countdown" class="countdown-ring-container"></div>
        <div class="intervention-actions">
          <button id="shield-cancel" class="btn btn-safe">Cancel transfer and protect ${formatCurrency(formData.amount)}</button>
          <button id="shield-call" class="btn btn-ghost">Call official bank</button>
          <button id="shield-proceed" class="btn btn-danger" disabled>Proceed anyway</button>
        </div>
      </div>
    `;

    state.countdownCleanup = createCountdownRing(
      $("#shield-countdown"),
      10,
      risk.tier >= 3 ? "#E76F51" : "#E8A24A",
      null,
      () => {
        const proceedButton = $("#shield-proceed");
        if (proceedButton) {
          proceedButton.disabled = false;
        }
      }
    );

    $("#shield-cancel").addEventListener("click", () => {
      ledger.add({
        mode: "shield",
        outcome: "cancelled",
        label: "Scam or impulse transfer blocked",
        saved: formData.amount,
        meta: { score: risk.score, tier: risk.tier },
      });
      hideOverlay();
      showToast(`${formatCurrency(formData.amount)} protected`, "success");
    });

    $("#shield-call").addEventListener("click", () => {
      showToast("Use the number on your card or official bank site, not the message that rushed you.", "info", 4500);
    });

    $("#shield-proceed").addEventListener("click", () => {
      ledger.add({
        mode: "shield",
        outcome: "proceeded",
        label: "Risky transfer was manually overridden",
        saved: 0,
        meta: { score: risk.score, tier: risk.tier },
      });
      hideOverlay();
      showToast("Override logged. Friction was offered, not forced.", "warning");
    });
  }

  function hideOverlay() {
    if (typeof state.countdownCleanup === "function") {
      state.countdownCleanup();
    }
    state.countdownCleanup = null;
    const overlay = $("#shield-overlay");
    overlay.classList.add("hidden");
    overlay.innerHTML = "";
  }

  function evaluateRisk(data) {
    let score = 8;
    const reasons = [];
    const recipient = data.recipient.toLowerCase();
    const message = data.message.toLowerCase();

    if (/@gmail\.com|@yahoo\.com|@outlook\.com/.test(recipient)) {
      score += 34;
      reasons.push("Recipient uses a personal email address");
    }
    if (/\burgent|verify|immediate|suspended|freeze|last chance|forever\b/.test(message)) {
      score += 28;
      reasons.push("Urgency and scarcity language detected");
    }
    if (data.amount >= 1000) {
      score += 24;
      reasons.push("High-value irreversible transfer");
    }
    if (/flashdrop|verify|secure/.test(recipient)) {
      score += 12;
      reasons.push("Brand mimic or suspicious merchant naming");
    }
    if (/buy now|one click|midnight/.test(message)) {
      score += 16;
      reasons.push("Impulse purchase framing is doing the persuasion");
    }
    if (message.length > 80) {
      score += 4;
    }

    score = clamp(Math.round(score), 0, 100);
    const tier = score >= 76 ? 3 : score >= 51 ? 2 : score >= 31 ? 1 : 0;
    return { score, tier, reasons: reasons.length ? reasons : ["No significant risk signals detected"] };
  }

  return manifest;
}
