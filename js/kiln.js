import { $, escapeHtml, showToast, postJson, debounce, clamp } from "./ui.js";

export function createKilnMode({ ledger }) {
  const state = {
    assessment: {
      heat: 0,
      category: "neutral",
      softened: "",
      steelman: "Type a message to see what the second thought engine catches.",
      source: "fallback",
    },
    coolingItems: [],
  };

  let requestId = 0;

  const manifest = {
    id: "kiln",
    label: "Kiln",
    accent: "amber",
    init() {
      $("#kiln-input").addEventListener("input", debouncedAssess);
      $("#kiln-send").addEventListener("click", handlePrimarySend);
      $("#kiln-send-original").addEventListener("click", () => completeSend("original"));
      $("#kiln-send-softened").addEventListener("click", () => completeSend("softened"));
      renderAssessment();
    },
    reset() {
      $("#kiln-input").value = "";
      state.assessment = {
        heat: 0,
        category: "neutral",
        softened: "",
        steelman: "Type a message to see what the second thought engine catches.",
        source: "fallback",
      };
      state.coolingItems = [];
      renderCooling();
      renderAssessment();
    },
    getDemoState() {
      return {
        assessment: state.assessment,
        coolingItems: state.coolingItems.length,
      };
    },
  };

  const debouncedAssess = debounce(async () => {
    const text = $("#kiln-input").value.trim();
    const currentId = ++requestId;
    if (!text) {
      state.assessment = {
        heat: 0,
        category: "neutral",
        softened: "",
        steelman: "Type a message to see what the second thought engine catches.",
        source: "fallback",
      };
      renderAssessment();
      return;
    }

    setSource("Analyzing message...");
    try {
      const result = await postJson("/api/gemini/heat", { text });
      if (currentId !== requestId) {
        return;
      }
      state.assessment = result;
    } catch {
      if (currentId !== requestId) {
        return;
      }
      state.assessment = localHeuristic(text);
    }
    renderAssessment();
  }, 500);

  function handlePrimarySend() {
    if (state.assessment.category === "critical") {
      queueCoolingItem();
      return;
    }

    if (state.assessment.category === "hot") {
      showToast("A hotter message needs a conscious choice: original or softened.", "warning");
      return;
    }

    completeSend(state.assessment.category === "apology" ? "apology" : "clean");
  }

  function completeSend(path) {
    const text = $("#kiln-input").value.trim();
    if (!text) {
      return;
    }

    const outcome = path === "softened" ? "softened" : "sent";
    ledger.add({
      mode: "kiln",
      outcome,
      label: path === "softened" ? "Message softened before sending" : "Message sent after review",
      heat: state.assessment.heat,
      meta: {
        category: state.assessment.category,
      },
    });

    showToast(
      path === "softened"
        ? "The calmer version was chosen."
        : state.assessment.category === "apology"
          ? "Apology took the fast lane."
          : "Message sent.",
      path === "softened" || state.assessment.category === "apology" ? "success" : "info"
    );

    $("#kiln-input").value = "";
    requestId += 1;
    state.assessment = localHeuristic("");
    renderAssessment();
  }

  function queueCoolingItem() {
    const text = $("#kiln-input").value.trim();
    if (!text) {
      return;
    }

    const item = {
      id: Date.now(),
      text,
      heat: state.assessment.heat,
      remaining: 30,
      releaseReady: false,
    };
    state.coolingItems.unshift(item);
    $("#kiln-input").value = "";
    state.assessment = localHeuristic("");
    renderAssessment();
    renderCooling();
    showToast("Critical message moved into the cooling drawer for 30 seconds.", "warning");

    const timer = window.setInterval(() => {
      item.remaining -= 1;
      if (item.remaining <= 0) {
        item.releaseReady = true;
        item.remaining = 0;
        window.clearInterval(timer);
      }
      renderCooling();
    }, 1000);
  }

  function renderAssessment() {
    const { heat, category, softened, steelman, source } = state.assessment;
    $("#kiln-heat-value").textContent = String(heat);
    const bar = $("#kiln-heat-bar");
    bar.style.width = `${heat}%`;
    bar.style.background =
      category === "critical"
        ? "#E76F51"
        : category === "hot"
          ? "#d78a45"
          : category === "warm"
            ? "#E8A24A"
            : category === "apology"
              ? "#2E9B6A"
              : "#64748B";

    const send = $("#kiln-send");
    send.className = `send-btn ${buttonTone(category)}`;
    send.textContent =
      category === "critical"
        ? "Cool for 30s"
        : category === "apology"
          ? "Send apology now"
          : category === "hot"
            ? "Choose version below"
            : "Send";
    send.disabled = false;
    send.style.transform = `translateY(${Math.round(heat * 0.04)}px) scale(${(1 - heat * 0.0012).toFixed(3)})`;
    send.style.fontWeight = String(500 + Math.round(heat * 2));

    const steelmanBox = $("#kiln-steelman");
    if (heat >= 61 || category === "apology") {
      steelmanBox.classList.add("visible");
      $("#kiln-steelman-text").textContent = steelman;
      $("#kiln-softened-copy").textContent = softened ? `Softer option: ${softened}` : "";
      $("#kiln-send-original").style.display = category === "apology" ? "none" : "inline-flex";
      $("#kiln-send-softened").style.display =
        category === "hot" || category === "critical" ? "inline-flex" : category === "apology" ? "none" : "inline-flex";
      if (category === "apology") {
        steelmanBox.classList.add("apology-halo");
      } else {
        steelmanBox.classList.remove("apology-halo");
      }
    } else {
      steelmanBox.classList.remove("visible", "apology-halo");
      $("#kiln-softened-copy").textContent = "";
    }

    setSource(source === "gemini" ? "Live AI assessment" : "Fallback heuristics");
  }

  function renderCooling() {
    const drawer = $("#kiln-cooling");
    const list = $("#kiln-cooling-list");
    if (!state.coolingItems.length) {
      drawer.classList.remove("visible");
      list.innerHTML = `<div class="cooling-empty">Critical messages that need time will land here.</div>`;
      return;
    }

    drawer.classList.add("visible");
    list.innerHTML = state.coolingItems
      .map(
        (item) => `
          <div class="cooling-item">
            <div class="cooling-text">${escapeHtml(item.text.slice(0, 96))}</div>
            <div class="cooling-timer">${item.releaseReady ? "Ready" : `${item.remaining}s`}</div>
            <button class="btn btn-sm ${item.releaseReady ? "btn-safe" : "btn-ghost"}" data-release="${item.id}" ${
              item.releaseReady ? "" : "disabled"
            }>Release</button>
            <button class="btn btn-sm btn-ghost" data-discard="${item.id}">Discard</button>
          </div>
        `
      )
      .join("");

    list.querySelectorAll("[data-release]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = Number(button.dataset.release);
        const item = state.coolingItems.find((entry) => entry.id === id);
        if (!item || !item.releaseReady) {
          return;
        }
        ledger.add({
          mode: "kiln",
          outcome: "released",
          label: "Critical message survived the cooling drawer",
          heat: item.heat,
        });
        state.coolingItems = state.coolingItems.filter((entry) => entry.id !== id);
        renderCooling();
        showToast("Message released after cooling.", "info");
      });
    });

    list.querySelectorAll("[data-discard]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = Number(button.dataset.discard);
        state.coolingItems = state.coolingItems.filter((entry) => entry.id !== id);
        renderCooling();
        showToast("Message discarded instead of sent.", "success");
      });
    });
  }

  function setSource(text) {
    $("#kiln-source").textContent = text;
  }

  return manifest;
}

function buttonTone(category) {
  if (category === "critical") {
    return "critical";
  }
  if (category === "hot") {
    return "hot";
  }
  if (category === "warm" || category === "apology") {
    return "warm";
  }
  return "neutral";
}

function localHeuristic(text) {
  const value = String(text || "").trim();
  if (!value) {
    return {
      heat: 0,
      category: "neutral",
      softened: "",
      steelman: "Type a message to see what the second thought engine catches.",
      source: "fallback",
    };
  }

  const lower = value.toLowerCase();
  if (/\bsorry|apologize|my fault|i was wrong|forgive me\b/.test(lower)) {
    return {
      heat: 8,
      category: "apology",
      softened: value,
      steelman: "This already sounds accountable. The faster move may be to send it cleanly and let repair start.",
      source: "fallback",
    };
  }

  let heat = 12;
  if (/\bidiot|stupid|useless|pathetic\b/.test(lower)) heat += 32;
  if (/\balways|never\b/.test(lower)) heat += 12;
  if (/\bimmediately|urgent|right now|asap\b/.test(lower)) heat += 10;
  if (/!{2,}/.test(value)) heat += 12;
  if (value.length > 160) heat += 8;
  if (value.replace(/[^A-Z]/g, "").length / Math.max(1, value.replace(/[^A-Za-z]/g, "").length) > 0.35) heat += 15;

  heat = clamp(Math.round(heat), 0, 100);
  const category = heat >= 86 ? "critical" : heat >= 61 ? "hot" : heat >= 31 ? "warm" : "neutral";

  return {
    heat,
    category,
    softened: value
      .replace(/\byou always\b/gi, "I keep noticing")
      .replace(/\byou never\b/gi, "I do not feel")
      .replace(/\s*!+\s*/g, ". "),
    steelman:
      category === "critical"
        ? "This is likely to escalate the situation faster than it solves it. The goal may be accountability, but the current tone mainly delivers impact."
        : category === "hot"
          ? "The point is probably real. The current wording makes the other person defend themselves before they can hear the substance."
          : "A cleaner version would keep the point and remove the heat.",
    source: "fallback",
  };
}
