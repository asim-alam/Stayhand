"use client";

import Link from "next/link";
import { AuthControl } from "@/components/shared/auth-control";

export function SiteHeader({
  active = "home",
}: {
  active?: "home" | "demo" | "results";
}) {
  return (
    <header className="site-header">
      <div className="site-header__brand">
        <Link href="/" className="site-header__brand-link">
          <img src="/logo.png" alt="" style={{ width: 24, height: 24, marginRight: 8, borderRadius: 4, verticalAlign: 'middle', boxShadow: '0 0 24px rgba(240, 161, 58, 0.12)' }} />
          <span><span style={{ color: 'var(--amber)' }}>Stay</span>hand</span>
        </Link>
      </div>

      <nav className="site-header__nav" aria-label="Primary">
        <Link href="/send" className="site-header__link">
          Live App
        </Link>
        <Link href="/demo" className={`site-header__link ${active === "demo" ? "active" : ""}`}>
          Demo
        </Link>
        <Link href="/results" className={`site-header__link ${active === "results" ? "active" : ""}`}>
          Outcomes
        </Link>
        <AuthControl />
      </nav>
    </header>
  );
}

