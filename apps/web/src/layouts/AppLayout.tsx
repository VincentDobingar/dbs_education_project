import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, Navigate, Outlet } from "react-router-dom";

import { getTenantLogo } from "../lib/schoolConfigApi.js";
import { clearSession, loadSession } from "../lib/session.js";

const NAV_LINKS = [
  { to: "/tableau-de-bord", key: "layout.nav.dashboard" },
  { to: "/eleves", key: "layout.nav.students" },
  { to: "/utilisateurs", key: "layout.nav.users" },
  { to: "/personnel", key: "layout.nav.employees" },
  { to: "/emplois-du-temps", key: "layout.nav.timetable" },
  { to: "/presences", key: "layout.nav.attendance" },
  { to: "/discipline", key: "layout.nav.discipline" },
  { to: "/notes", key: "layout.nav.grading" },
  { to: "/bulletins", key: "layout.nav.reportCards" },
  { to: "/finances", key: "layout.nav.finance" },
  { to: "/devoirs", key: "layout.nav.homework" },
  { to: "/annonces", key: "layout.nav.announcements" },
  { to: "/support", key: "layout.nav.support" },
  { to: "/bibliotheque", key: "layout.nav.library" },
  { to: "/transport", key: "layout.nav.transport" },
  { to: "/cantine", key: "layout.nav.cafeteria" },
  { to: "/internat", key: "layout.nav.boarding" },
  { to: "/e-learning", key: "layout.nav.elearning" },
  { to: "/configuration", key: "layout.nav.configuration" },
] as const;

function navLinkClassName({ isActive }: { isActive: boolean }): string {
  return `text-sm font-medium transition-colors ${isActive ? "text-brand-teal" : "text-white/70 hover:text-white"}`;
}

export function AppLayout(): ReactNode {
  const { t } = useTranslation("app");
  const session = loadSession();

  // Le logo n'est pas dans la session (posé une fois à la connexion) : un
  // changement fait depuis Configuration doit apparaître ici sans se reconnecter,
  // donc une requête à part plutôt qu'un champ figé dans le token.
  const tenantLogo = useQuery({
    queryKey: ["tenant-logo", session?.subdomain],
    queryFn: () => getTenantLogo({ accessToken: session!.accessToken, subdomain: session!.subdomain }),
    enabled: Boolean(session),
  });
  // L'URL peut être valide en base mais momentanément injoignable (redémarrage du
  // serveur qui l'héberge, etc.) — un <img> resté sur l'icône « image cassée » du
  // navigateur jusqu'au prochain rechargement est pire qu'une absence de logo.
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);
  const logoUrl = logoLoadFailed ? null : tenantLogo.data?.logoUrl;

  if (!session) {
    return <Navigate to="/connexion" replace />;
  }

  function handleLogout(): void {
    clearSession();
    window.location.assign("/connexion");
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="bg-brand-night">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex min-w-0 items-center gap-3">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt=""
                className="h-10 w-10 shrink-0 rounded-md bg-white object-contain p-1"
                onError={() => setLogoLoadFailed(true)}
              />
            ) : null}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{session.tenantName}</p>
              <p className="truncate text-xs text-white/60">{session.email}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="shrink-0 rounded-md border border-white/30 px-3 py-1.5 text-sm text-white/80 transition-colors hover:bg-white/10"
          >
            {t("layout.logout")}
          </button>
        </div>

        <nav className="border-t border-white/10">
          <div className="mx-auto flex max-w-7xl items-center gap-x-7 overflow-x-auto whitespace-nowrap px-6 py-2.5">
            {NAV_LINKS.map((link) => (
              <NavLink key={link.to} to={link.to} className={navLinkClassName}>
                {t(link.key)}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
