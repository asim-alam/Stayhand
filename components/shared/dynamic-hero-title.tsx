"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

type TitleSegment = {
  text: string;
  className?: string;
};

const TITLE_SEGMENTS: TitleSegment[] = [
  { text: "Every App Makes You Act " },
  { text: "Faster", className: "strike" },
  { text: ". " },
  { text: "Stayhand Makes You Act Better.", className: "accent" },
];

export function DynamicHeroTitle() {
  const totalChars = useMemo(
    () => TITLE_SEGMENTS.reduce((sum, segment) => sum + segment.text.length, 0),
    [],
  );
  const [visibleChars, setVisibleChars] = useState(totalChars);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisibleChars(totalChars);
      return;
    }

    setVisibleChars(0);
    const interval = window.setInterval(() => {
      setVisibleChars((count) => {
        if (count >= totalChars) {
          window.clearInterval(interval);
          return totalChars;
        }
        return count + 1;
      });
    }, 24);

    return () => window.clearInterval(interval);
  }, [totalChars]);

  const done = visibleChars >= totalChars;
  let offset = 0;

  return (
    <>
      {TITLE_SEGMENTS.map((segment, index) => {
        const start = offset;
        const end = start + segment.text.length;
        offset = end;

        if (visibleChars <= start) {
          return <Fragment key={index} />;
        }

        const visibleLength = Math.min(segment.text.length, visibleChars - start);
        const text = segment.text.slice(0, visibleLength);

        if (segment.className) {
          return (
            <span key={index} className={segment.className}>
              {text}
            </span>
          );
        }

        return <Fragment key={index}>{text}</Fragment>;
      })}
      {!done && <span className="hero-title-caret" aria-hidden />}
    </>
  );
}
