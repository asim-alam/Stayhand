"use client";

import Link from "next/link";
import { SURFACE_META } from "@/lib/scenarios/catalog";
import type { RealModeSurface } from "@/lib/real-mode/types";
import { AuthControl } from "@/components/shared/auth-control";

const ORDER: RealModeSurface[] = ["send", "buy", "reply"];

export function SurfaceTopbar({
  surface,
  modeLabel = "real mode",
  actionHref,
  actionLabel,
  getSurfaceHref,
}: {
  surface: RealModeSurface;
  modeLabel?: string;
  actionHref: string;
  actionLabel: string;
  getSurfaceHref?: (surface: RealModeSurface) => string;
}) {
  return (
    <header className="real-topbar">
      <div className="real-topbar__brand">
        <Link href="/" className="top-link site-header__brand-link" style={{ textDecoration: 'none' }}>
          <img src="/logo.png" alt="" style={{ width: 24, height: 24, marginRight: 8, borderRadius: 4, verticalAlign: 'middle', boxShadow: '0 0 24px rgba(240, 161, 58, 0.12)' }} />
          <span><span style={{ color: 'var(--amber)' }}>Stay</span>hand</span>
        </Link>
        <span className="real-topbar__label">{modeLabel}</span>
      </div>

      <nav className="surface-nav" aria-label="Surface switcher">
        {ORDER.map((item) => (
          <a
            key={item}
            href={getSurfaceHref ? getSurfaceHref(item) : `/${item}`}
            className={`surface-nav__link ${item === surface ? "active" : ""}`}
          >
            {SURFACE_META[item].label}
          </a>
        ))}
      </nav>

      <div className="real-topbar__actions">
        <AuthControl />
        <a href={actionHref} className="button ghost">
          {actionLabel}
        </a>
      </div>
    </header>
  );
}
