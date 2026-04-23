import { $, escapeHtml, formatCurrency, formatRelativeTime } from "./ui.js";

const STORAGE_KEY = "second-thought-ledger-v1";
const SEEDED_KEY = "second-thought-ledger-seeded";

const seedEntries = [
  {
    mode: "shield",
    outcome: "cancelled",
    label: "Scam transfer blocked",
    saved: 2500,
    ts: hoursAgo(6),
  },
  {
    mode: "kiln",
    outcome: "softened",
    label: "Message reviewed before sending",
    heat: 84,
    ts: hoursAgo(5),
  },
  {
    mode: "quarry",
    outcome: "completed",
    label: "Three launch drafts generated",
    ts: hoursAgo(4),
  },
  {
    mode: "lab",
    outcome: "scanned",
    label: "Friction MRI completed",
    quotient: 41,
    meta: { archetype: "THE DRIFTER" },
    ts: hoursAgo(3),
  },
];

function hoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

export function createLedger() {
  const ledger = {
    init() {
      this.seedIfNeeded();
      this.updateUI();
    },

    seedIfNeeded() {
      if (localStorage.getItem(SEEDED_KEY)) {
        return;
      }
      const seeded = seedEntries.map((entry, index) => ({
        id: Date.now() - index,
        ...entry,
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      localStorage.setItem(SEEDED_KEY, "true");
    },

    getAll() {
      try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    },

    add(entry) {
      const next = [
        {
          id: Date.now(),
          ts: new Date().toISOString(),
          ...entry,
        },
        ...this.getAll(),
      ].slice(0, 100);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      this.updateUI();
    },

    getStats() {
      const entries = this.getAll();
      const protectedMoney = entries
        .filter((entry) => entry.mode === "shield" && entry.outcome === "cancelled")
        .reduce((sum, entry) => sum + Number(entry.saved || 0), 0);
      const cooled = entries.filter((entry) => entry.mode === "kiln" && Number(entry.heat || 0) >= 60).length;
      const drafts = entries.filter((entry) => entry.mode === "quarry").length;
      const scans = entries.filter((entry) => entry.mode === "lab").length;
      const quotientEntries = entries.filter((entry) => Number.isFinite(Number(entry.quotient)));
      const avgQuotient = quotientEntries.length
        ? Math.round(quotientEntries.reduce((sum, entry) => sum + Number(entry.quotient), 0) / quotientEntries.length)
        : 52;
      const latestArchetype =
        entries.find((entry) => entry.mode === "lab" && entry.meta?.archetype)?.meta?.archetype || "STANDBY";

      return {
        protectedMoney,
        cooled,
        drafts,
        scans,
        avgQuotient,
        latestArchetype,
      };
    },

    updateUI() {
      const stats = this.getStats();
      const entries = this.getAll().slice(0, 10);

      setText("#ledger-protected", formatCurrency(stats.protectedMoney));
      setText("#ledger-cooled", String(stats.cooled));
      setText("#ledger-drafts", String(stats.drafts));
      setText("#ledger-scans", String(stats.scans));
      setText("#ledger-quotient", `${stats.avgQuotient}/100`);
      setText("#ledger-archetype", stats.latestArchetype);
      setText("#nav-ledger-score", `FQ ${stats.avgQuotient}`);

      const historyFeed = $("#history-feed");
      if (!historyFeed) {
        return;
      }

      historyFeed.innerHTML = entries
        .map((entry) => {
          const icon = getModeIcon(entry.mode);
          const tone = getOutcomeTone(entry);
          return `
            <div class="history-item">
              <div class="history-icon ${tone.className}">${icon}</div>
              <div class="history-content">
                <div class="history-title">${escapeHtml(entry.label)}</div>
                <div class="history-meta">${formatRelativeTime(entry.ts)}</div>
              </div>
              <div class="history-outcome ${tone.className}">${escapeHtml(tone.label)}</div>
            </div>
          `;
        })
        .join("");
    },
  };

  return ledger;
}

function setText(selector, value) {
  const element = $(selector);
  if (element) {
    element.textContent = value;
  }
}

function getModeIcon(mode) {
  return (
    {
      shield: "S",
      kiln: "K",
      quarry: "Q",
      lab: "L",
    }[mode] || "?"
  );
}

function getOutcomeTone(entry) {
  if (entry.mode === "shield") {
    return entry.outcome === "cancelled"
      ? { className: "tone-sage", label: "blocked" }
      : { className: "tone-coral", label: "overrode" };
  }
  if (entry.mode === "kiln") {
    return entry.outcome === "softened"
      ? { className: "tone-sage", label: "softened" }
      : { className: "tone-amber", label: "reviewed" };
  }
  if (entry.mode === "quarry") {
    return { className: "tone-indigo", label: "earned" };
  }
  if (entry.mode === "lab") {
    return { className: "tone-cyan", label: "scanned" };
  }
  return { className: "tone-amber", label: "logged" };
}
