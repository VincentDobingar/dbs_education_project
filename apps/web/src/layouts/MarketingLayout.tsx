import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, Outlet } from "react-router-dom";

import { LanguageSwitcher } from "../components/LanguageSwitcher.js";

const NAV_LINKS = [
  { to: "/", key: "nav.home" },
  { to: "/tarifs", key: "nav.pricing" },
  { to: "/contact", key: "nav.contact" },
] as const;

function navLinkClassName({ isActive }: { isActive: boolean }): string {
  return `text-sm font-medium transition-colors ${isActive ? "text-brand-teal" : "text-white/80 hover:text-white"}`;
}

export function MarketingLayout(): ReactNode {
  const { t } = useTranslation("marketing");

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="bg-brand-night">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center rounded-md bg-white px-3 py-1.5">
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

          <div className="flex items-center gap-3">
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
        </div>
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
