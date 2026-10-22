import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";

import { InstallAppButton } from "../components/InstallAppButton.js";
import { LanguageSwitcher } from "../components/LanguageSwitcher.js";

const NAV_LINKS = [
  { to: "/", key: "nav.home" },
  { to: "/tarifs", key: "nav.pricing" },
  { to: "/guide", key: "nav.guide" },
  { to: "/contact", key: "nav.contact" },
] as const;

function mobileNavLinkClassName({ isActive }: { isActive: boolean }): string {
  return `border-b border-white/10 py-3 text-base font-medium ${isActive ? "text-brand-teal" : "text-white/90"}`;
}

function navLinkClassName({ isActive }: { isActive: boolean }): string {
  return `text-sm font-medium transition-colors ${isActive ? "text-brand-teal" : "text-white/80 hover:text-white"}`;
}

export function MarketingLayout(): ReactNode {
  const { t } = useTranslation("marketing");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();

  // Referme le menu mobile à chaque changement de page.
  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="relative z-40 bg-brand-night">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
          <Link to="/" className="flex shrink-0 items-center rounded-md bg-white px-3 py-1.5">
            <img
              src="/logo-dbsas-trimmed.png"
              alt="Digital Business Services Africa School"
              className="h-9 w-auto"
            />
          </Link>

          <nav className="hidden items-center gap-6 md:flex">
            {NAV_LINKS.map((link) => (
              <NavLink key={link.to} to={link.to} end className={navLinkClassName}>
                {t(link.key)}
              </NavLink>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <LanguageSwitcher />
            <Link
              to="/connexion"
              className="text-sm font-medium text-white/80 transition-colors hover:text-white"
            >
              {t("nav.login")}
            </Link>
            <Link
              to="/inscription"
              className="rounded-md bg-brand-teal px-4 py-2 text-sm font-medium text-brand-night transition-colors hover:brightness-110"
            >
              {t("nav.subscribe")}
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setIsMenuOpen((open) => !open)}
            aria-expanded={isMenuOpen}
            aria-controls="marketing-menu"
            aria-label={t(isMenuOpen ? "nav.menu.close" : "nav.menu.open")}
            className="inline-flex items-center justify-center rounded-md border border-white/30 p-2 text-white transition-colors hover:bg-white/10 md:hidden"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
              aria-hidden="true"
            >
              {isMenuOpen ? <path d="M18 6 6 18M6 6l12 12" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>

        {isMenuOpen ? (
          <div
            id="marketing-menu"
            className="absolute inset-x-0 top-full border-t border-white/10 bg-brand-night px-4 pb-6 pt-2 shadow-xl md:hidden"
          >
            <nav className="flex flex-col">
              {NAV_LINKS.map((link) => (
                <NavLink key={link.to} to={link.to} end className={mobileNavLinkClassName}>
                  {t(link.key)}
                </NavLink>
              ))}
              <NavLink to="/connexion" className={mobileNavLinkClassName}>
                {t("nav.login")}
              </NavLink>
              <NavLink to="/portail/connexion" className={mobileNavLinkClassName}>
                {t("nav.portal")}
              </NavLink>
            </nav>
            <Link
              to="/inscription"
              className="mt-4 block rounded-md bg-brand-teal px-4 py-3 text-center text-sm font-semibold text-brand-night"
            >
              {t("nav.subscribe")}
            </Link>
            <InstallAppButton className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-white/30 px-4 py-3 text-sm font-medium text-white" />
            <div className="mt-4 flex justify-center">
              <LanguageSwitcher />
            </div>
          </div>
        ) : null}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="bg-brand-night text-white/70">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="grid gap-8 md:grid-cols-3">
            <div>
              <img
                src="/logo-icon-square.png"
                alt="Digital Business Services Africa School"
                className="h-14 w-14 rounded-md bg-white p-1"
              />
              <p className="mt-3 text-lg font-semibold text-white">Digital Business Services Africa School</p>
              <p className="mt-2 text-sm">{t("footer.tagline")}</p>
            </div>

            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-white/50">
                {t("footer.product")}
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <Link to="/tarifs" className="hover:text-white">
                    {t("nav.pricing")}
                  </Link>
                </li>
                <li>
                  <Link to="/guide" className="hover:text-white">
                    {t("nav.guide")}
                  </Link>
                </li>
                <li>
                  <Link to="/contact" className="hover:text-white">
                    {t("nav.contact")}
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-white/50">
                {t("footer.legal")}
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <Link to="/conditions-generales" className="hover:text-white">
                    {t("footer.legal.terms")}
                  </Link>
                </li>
                <li>
                  <Link to="/confidentialite" className="hover:text-white">
                    {t("footer.legal.privacy")}
                  </Link>
                </li>
                <li>
                  <Link to="/remboursement" className="hover:text-white">
                    {t("footer.legal.refund")}
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <p className="mt-8 border-t border-white/10 pt-6 text-xs">
            © {new Date().getFullYear()} Digital Business Services Africa School. {t("footer.rights")}
          </p>
        </div>
      </footer>
    </div>
  );
}
