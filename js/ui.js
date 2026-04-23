export function $(selector, root = document) {
  return root.querySelector(selector);
}

export function $all(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function showToast(message, type = "info", duration = 3500) {
  const container = $("#toast-container");
  if (!container) {
    return;
  }

  const icons = {
    success: "[ok]",
    warning: "[!]",
    info: "[i]",
    error: "[x]",
  };

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `<span>${icons[type] || icons.info}</span><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  window.setTimeout(() => {
    toast.classList.add("toast-out");
    window.setTimeout(() => toast.remove(), 320);
  }, duration);
}

export function formatCurrency(value) {
  const number = Number(value || 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(number);
}

export function formatRelativeTime(iso) {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.max(1, Math.round(diffMs / 60000));
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function createCountdownRing(container, seconds, color, onTick, onComplete) {
  container.innerHTML = `
    <div class="countdown-svg-wrap">
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r="42" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="6"></circle>
        <circle class="progress-ring progress-ring-fill" cx="48" cy="48" r="45" fill="none" stroke="${color}" stroke-width="6"></circle>
      </svg>
      <div class="countdown-number">${seconds}</div>
    </div>
  `;

  const fill = $(".progress-ring-fill", container);
  const number = $(".countdown-number", container);
  const circumference = 2 * Math.PI * 45;
  fill.style.strokeDasharray = `${circumference}`;

  let remaining = seconds;
  setRing(fill, circumference, remaining / seconds);

  const timer = window.setInterval(() => {
    remaining -= 1;
    if (number) {
      number.textContent = String(Math.max(remaining, 0));
    }
    setRing(fill, circumference, Math.max(remaining, 0) / seconds);
    if (typeof onTick === "function") {
      onTick(remaining);
    }
    if (remaining <= 0) {
      window.clearInterval(timer);
      if (typeof onComplete === "function") {
        onComplete();
      }
    }
  }, 1000);

  return () => window.clearInterval(timer);
}

function setRing(node, circumference, ratio) {
  if (!node) {
    return;
  }
  node.style.strokeDashoffset = String(circumference - circumference * ratio);
}

export function debounce(fn, wait = 300) {
  let timer = 0;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  return response.json();
}
