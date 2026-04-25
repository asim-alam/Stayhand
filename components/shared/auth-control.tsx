"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";

type AuthUser = {
  id: string;
  displayName: string;
};

export function AuthControl() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname() || "/";
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { user?: AuthUser | null }) => {
        setUser(data.user ?? null);
        setLoading(false);
      })
      .catch(() => {
        setUser(null);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function signOut() {
    await fetch("/api/auth/sign-out", { method: "POST" });
    setUser(null);
    setMenuOpen(false);
    router.refresh();
  }

  if (loading) {
    return (
      <div className="auth-control">
        <span className="site-header__link auth-control__placeholder" aria-hidden="true">...</span>
      </div>
    );
  }

  return (
    <div className="auth-control" ref={menuRef}>
      {user ? (
        <>
          <button
            type="button"
            className="site-header__link auth-control__account"
            onClick={() => setMenuOpen(!menuOpen)}
            title="Account Menu"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            <span className="auth-control__name">{user.displayName}</span>
            <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          {menuOpen && (
            <div className="auth-control__menu" role="menu" aria-label="Account menu">
              <div className="auth-control__menu-head">
                <span className="eyebrow auth-control__menu-label">Signed in as</span>
                <strong>{user.displayName}</strong>
              </div>
              <button
                type="button"
                className="auth-control__menu-item"
                onClick={() => void signOut()}
                role="menuitem"
              >
                Sign out
              </button>
            </div>
          )}
        </>
      ) : (
        <Link href={`/login?callbackUrl=${encodeURIComponent(pathname)}`} className="site-header__link auth-control__login-link">
          Sign in
        </Link>
      )}
    </div>
  );
}
