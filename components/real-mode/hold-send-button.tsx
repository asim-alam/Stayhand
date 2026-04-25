"use client";

import { useEffect, useRef, useState } from "react";
import type { ReplyCategory } from "@/lib/real-mode/types";

export function HoldSendButton({
  heat,
  category,
  disabled = false,
  onSend,
  onWantsCool,
  onApology,
  neutralLabel = "send reply",
}: {
  heat: number;
  category: ReplyCategory;
  disabled?: boolean;
  onSend: () => void;
  onWantsCool: () => void;
  onApology: () => void;
  neutralLabel?: string;
}) {
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const frameRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);

  const isApology = category === "apology";
  const holdMs = isApology ? 0 : heat >= 80 ? 2600 : heat >= 50 ? 1100 : 0;

  useEffect(() => {
    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  function clearHold() {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    setHolding(false);
    setProgress(0);
    startRef.current = 0;
  }

  function finish() {
    clearHold();
    if (heat >= 80) {
      onWantsCool();
      return;
    }
    onSend();
  }

  function tick(now: number) {
    if (!startRef.current) {
      startRef.current = now;
    }
    const elapsed = now - startRef.current;
    const next = Math.min(1, elapsed / holdMs);
    setProgress(next);
    if (next >= 1) {
      finish();
      return;
    }
    frameRef.current = requestAnimationFrame(tick);
  }

  function startHold() {
    if (disabled) return;
    if (isApology) {
      onApology();
      return;
    }
    if (holdMs === 0) {
      onSend();
      return;
    }
    setHolding(true);
    setProgress(0);
    startRef.current = 0;
    frameRef.current = requestAnimationFrame(tick);
  }

  const label = isApology
    ? "send with care"
    : heat >= 80
      ? holding ? "keep holding…" : "hold to cool"
      : heat >= 50
        ? holding ? "hold…" : "press & hold"
        : neutralLabel;

  return (
    <button
      type="button"
      disabled={disabled}
      onMouseDown={startHold}
      onMouseUp={clearHold}
      onMouseLeave={clearHold}
      onTouchStart={(event) => {
        event.preventDefault();
        startHold();
      }}
      onTouchEnd={clearHold}
      onTouchCancel={clearHold}
      onClick={(event) => {
        if (holdMs !== 0 || disabled) return;
        event.preventDefault();
        if (isApology) {
          onApology();
        } else {
          onSend();
        }
      }}
      className={`hold-send-button ${isApology ? "is-apology" : ""}`}
      style={{
        transform: `scale(${1 + Math.min(heat, 100) / 1200})`,
        boxShadow: heat >= 80
          ? "0 0 0 5px rgba(231,111,81,0.16), 0 16px 40px rgba(231,111,81,0.18)"
          : heat >= 50
            ? "0 0 0 4px rgba(232,162,74,0.15), 0 16px 36px rgba(232,162,74,0.16)"
            : undefined,
      }}
    >
      {holding && <span className="hold-send-button__progress" style={{ width: `${progress * 100}%` }} />}
      <span className="hold-send-button__label">{label}</span>
      <span className="hold-send-button__icon">{isApology ? "♡" : "→"}</span>
    </button>
  );
}
