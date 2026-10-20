import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, useLocation } from "react-router-dom";

export interface SidebarLink {
  to: string;
  label: string;
  /** NavLink `end` : actif uniquement sur le chemin exact (ex. "/admin"). */
  end?: boolean;
}

interface SidebarShellProps {
  /** Nom de l'espace (établissement, super-administration, portail…). */
  title: string;
  /** Ligne secondaire, typiquement l'email connecté. */
  subtitle: string;
  logo?: ReactNode;
  links: readonly SidebarLink[];
  onLogout: () => void;
  /** Fond de la barre latérale (classe Tailwind). */
  toneClassName?: string;
  /** Bandeau affiché au-dessus du contenu (ex. abonnement inactif). */
  banner?: ReactNode;
  children: ReactNode;
}

function sidebarLinkClassName({ isActive }: { isActive: boolean }): string {
  return `block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
    isActive ? "bg-white/10 text-brand-teal" : "text-white/70 hover:bg-white/5 hover:text-white"
  }`;
}

/**
 * Coquille commune des espaces connectés (établissement, super-administration,
 * portail famille/élève) : menu en barre latérale fixe sur grand écran, tiroir
 * ouvert par un bouton sur mobile. Une seule <nav> est rendue pour les deux
 * tailles d'écran — pas de liens dupliqués.
 */
export function SidebarShell({
  title,
  subtitle,
  logo,
  links,
  onLogout,
  toneClassName = "bg-brand-night",
  banner,
  children,
}: SidebarShellProps): ReactNode {
  const { t } = useTranslation("app");
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  // Referme le tiroir mobile à chaque changement de page.
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Barre supérieure mobile */}
      <header className={`sticky top-0 z-30 flex items-center gap-3 px-4 py-3 lg:hidden ${toneClassName}`}>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-expanded={isOpen}
          aria-controls="app-sidebar"
          aria-label={t("layout.menu.open")}
          className="inline-flex items-center justify-center rounded-md border border-white/30 p-2 text-white/80 transition-colors hover:bg-white/10"
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
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <p className="min-w-0 truncate text-sm font-semibold text-white">{title}</p>
      </header>

      {isOpen ? (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
          aria-hidden="true"
          onClick={() => setIsOpen(false)}
        />
      ) : null}

      <aside
        id="app-sidebar"
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col transition-transform duration-200 lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        } ${toneClassName}`}
      >
        <div className="flex items-start gap-3 border-b border-white/10 px-4 py-4">
          {logo}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{title}</p>
            <p className="truncate text-xs text-white/60">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label={t("layout.menu.close")}
            className="rounded-md p-1 text-white/70 hover:bg-white/10 lg:hidden"
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
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end ?? false} className={sidebarLinkClassName}>
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/10 p-3">
          <button
            type="button"
            onClick={onLogout}
            className="w-full rounded-md border border-white/30 px-3 py-2 text-left text-sm text-white/80 transition-colors hover:bg-white/10"
          >
            {t("layout.logout")}
          </button>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col lg:pl-64">
        {banner}
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
