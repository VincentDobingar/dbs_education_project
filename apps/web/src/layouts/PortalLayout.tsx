import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, Navigate, Outlet } from "react-router-dom";

import { clearPortalSession, loadPortalSession } from "../lib/portalSession.js";

const NAV_LINKS = [
  { to: "/portail/parent", key: "portal.nav.parent" },
  { to: "/portail/eleve", key: "portal.nav.student" },
  { to: "/portail/activation", key: "portal.nav.redeem" },
] as const;

function navLinkClassName({ isActive }: { isActive: boolean }): string {
  return `text-sm font-medium transition-colors ${isActive ? "text-brand-teal" : "text-white/70 hover:text-white"}`;
}

function mobileNavLinkClassName({ isActive }: { isActive: boolean }): string {
  return `block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
    isActive ? "bg-white/10 text-brand-teal" : "text-white/70 hover:bg-white/5 hover:text-white"
  }`;
}

export function PortalLayout(): ReactNode {
  const { t } = useTranslation("app");
  const session = loadPortalSession();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  if (!session) {
    return <Navigate to="/portail/connexion" replace />;
  }

  function handleLogout(): void {
    clearPortalSession();
    window.location.assign("/portail/connexion");
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="bg-brand-night">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm font-semibold text-white">{t("portal.title")}</p>
            <p className="text-xs text-white/60">{session.email}</p>
          </div>

          <nav className="hidden items-center gap-6 md:flex">
            {NAV_LINKS.map((link) => (
              <NavLink key={link.to} to={link.to} className={navLinkClassName}>
                {t(link.key)}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleLogout}
              className="hidden rounded-md border border-white/30 px-3 py-1.5 text-sm text-white/80 transition-colors hover:bg-white/10 md:inline-flex"
            >
              {t("layout.logout")}
            </button>

            <button
              type="button"
              onClick={() => setIsMenuOpen((open) => !open)}
              aria-expanded={isMenuOpen}
              aria-controls="portal-mobile-nav"
              aria-label={t(isMenuOpen ? "layout.menu.close" : "layout.menu.open")}
              className="inline-flex items-center justify-center rounded-md border border-white/30 p-2 text-white/80 transition-colors hover:bg-white/10 md:hidden"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
                aria-hidden="true"
              >
                {isMenuOpen ? <path d="M18 6 6 18M6 6l12 12" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
              </svg>
            </button>
          </div>
        </div>

        {isMenuOpen && (
          <nav id="portal-mobile-nav" className="border-t border-white/10 px-4 pb-4 pt-2 md:hidden">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={mobileNavLinkClassName}
                onClick={() => setIsMenuOpen(false)}
              >
                {t(link.key)}
              </NavLink>
            ))}
            <button
              type="button"
              onClick={handleLogout}
              className="mt-2 block w-full rounded-md border border-white/30 px-3 py-2 text-left text-sm text-white/80 transition-colors hover:bg-white/10"
            >
              {t("layout.logout")}
            </button>
          </nav>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
