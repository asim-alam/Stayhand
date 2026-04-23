import { $, escapeHtml, postJson, showToast } from "./ui.js";

export function createQuarryMode({ ledger }) {
  const state = {
    questions: [],
    drafts: [],
    source: "fallback",
  };

  const manifest = {
    id: "quarry",
    label: "Quarry",
    accent: "indigo",
    init() {
      $("#quarry-start").addEventListener("click", generateQuestions);
      $("#quarry-generate").addEventListener("click", generateDrafts);
      $("#quarry-generate").disabled = true;
    },
    reset() {
      $("#quarry-intent").value = "";
      $("#quarry-questions").innerHTML = "";
      $("#quarry-drafts").innerHTML = "";
      $("#quarry-status").classList.add("hidden");
      $("#quarry-generate").disabled = true;
      $("#quarry-source").textContent = "Waiting for intent";
      state.questions = [];
      state.drafts = [];
    },
    getDemoState() {
      return {
        questions: state.questions.length,
        drafts: state.drafts.length,
      };
    },
  };

  async function generateQuestions() {
    const intent = $("#quarry-intent").value.trim();
    if (!intent) {
      showToast("Give Quarry a real creative brief first.", "warning");
      return;
    }

    setThinking(true, "Asking for stronger intent...");
    try {
      const result = await postJson("/api/gemini/quarry", { intent, phase: "questions" });
      state.questions = result.questions || [];
      state.source = result.source || "fallback";
    } catch {
      state.questions = fallbackQuestions(intent);
      state.source = "fallback";
    }

    $("#quarry-source").textContent = state.source === "gemini" ? "Live AI questioning" : "Fallback prompt set";
    renderQuestions();
    $("#quarry-generate").disabled = false;
    setThinking(false);
  }

  async function generateDrafts() {
    const intent = $("#quarry-intent").value.trim();
    const answers = Array.from(document.querySelectorAll(".question-answer")).map((textarea) => textarea.value.trim());
    if (answers.some((answer) => !answer)) {
      showToast("Answer all three questions before Quarry drafts anything.", "warning");
      return;
    }

    setThinking(true, "Cutting three deliberate directions...");
    try {
      const result = await postJson("/api/gemini/quarry", { intent, phase: "drafts", answers });
      state.drafts = result.drafts || [];
      state.source = result.source || "fallback";
    } catch {
      state.drafts = fallbackDrafts(intent, answers);
      state.source = "fallback";
    }

    $("#quarry-source").textContent = state.source === "gemini" ? "Live AI draft split" : "Fallback contrast drafts";
    renderDrafts(intent);
    setThinking(false);
  }

  function renderQuestions() {
    const container = $("#quarry-questions");
    container.innerHTML = state.questions
      .map(
        (question, index) => `
          <div class="question-card question-pop">
            <div class="question-number">Question ${index + 1}</div>
            <div class="question-text">${escapeHtml(question)}</div>
            <textarea class="input question-answer" rows="3" placeholder="Write the version that forces sharper thinking..."></textarea>
          </div>
        `
      )
      .join("");
  }

  function renderDrafts(intent) {
    const container = $("#quarry-drafts");
    container.innerHTML = state.drafts
      .map(
        (draft, index) => `
          <div class="draft-card" data-draft-index="${index}">
            <div class="draft-label">${escapeHtml(draft.label)}</div>
            <div class="draft-text">${escapeHtml(draft.text)}</div>
            <div class="stack-actions mt-4">
              <button class="btn btn-ghost" data-select-draft="${index}">Choose this direction</button>
            </div>
          </div>
        `
      )
      .join("");

    container.querySelectorAll("[data-select-draft]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.selectDraft);
        const draft = state.drafts[index];
        container.querySelectorAll(".draft-card").forEach((card, cardIndex) => {
          card.classList.toggle("selected", index === cardIndex);
        });
        ledger.add({
          mode: "quarry",
          outcome: "completed",
          label: `${draft.label} draft selected for ${intent.slice(0, 40)}`,
        });
        showToast(`${draft.label} draft selected and logged.`, "success");
      });
    });
  }

  function setThinking(visible, label = "Thinking...") {
    const node = $("#quarry-status");
    if (visible) {
      node.classList.remove("hidden");
      node.querySelector("span").textContent = label;
      return;
    }
    node.classList.add("hidden");
  }

  return manifest;
}

function fallbackQuestions(intent) {
  return [
    `Who is ${intent} actually for, and what would make that person stop scrolling?`,
    `What part of ${intent} feels slightly dangerous to say but would make it honest?`,
    `If this lived for six months, what would still feel true instead of trendy?`,
  ];
}

function fallbackDrafts(intent, answers) {
  const summary = answers.filter(Boolean).join(" ").trim();
  return [
    {
      label: "Direct",
      text: `${intent}: clear, concrete, useful. ${summary || "Built around the sharpest practical truth."}`,
    },
    {
      label: "Provocative",
      text: `${intent} is not another smooth story about speed. It is an argument that better defaults require resistance at the right moment.`,
    },
    {
      label: "Vulnerable",
      text: `We are building ${intent} because we know what it costs when everything gets easier except good judgment.`,
    },
  ];
}
