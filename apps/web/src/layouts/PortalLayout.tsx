import type { ReactNode } from "react";
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

export function PortalLayout(): ReactNode {
  const { t } = useTranslation("app");
  const session = loadPortalSession();

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

          <button
            type="button"
            onClick={handleLogout}
            className="rounded-md border border-white/30 px-3 py-1.5 text-sm text-white/80 transition-colors hover:bg-white/10"
          >
            {t("layout.logout")}
          </button>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
