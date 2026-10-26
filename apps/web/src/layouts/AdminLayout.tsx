import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { SidebarShell } from "../components/SidebarShell.js";
import { clearAdminSession, loadAdminSession } from "../lib/adminSession.js";

const NAV_LINKS = [
  { to: "/admin", key: "admin.nav.dashboard" },
  { to: "/admin/etablissements", key: "admin.nav.tenants" },
  { to: "/admin/abonnements", key: "admin.nav.subscriptions" },
  { to: "/admin/journaux-audit", key: "admin.nav.auditLogs" },
  { to: "/admin/donnees-reference", key: "admin.nav.referenceData" },
  { to: "/admin/codes-promo", key: "admin.nav.promotionCodes" },
  { to: "/admin/support", key: "admin.nav.supportTickets" },
  { to: "/admin/modeles-messages", key: "admin.nav.messageTemplates" },
  { to: "/admin/sponsors", key: "admin.nav.sponsors" },
  { to: "/admin/parametres", key: "admin.nav.platformSettings" },
  { to: "/admin/guide", key: "admin.nav.guide" },
] as const;

/**
 * §31 : distincte d'AppLayout (staff tenant) et de PortalLayout (parent/élève) —
 * un compte plateforme n'a typiquement aucune adhésion tenant, donc rien d'autre
 * ne le distingue avant que GET /auth/me ne renvoie platformRoleCodes.
 */
export function AdminLayout(): ReactNode {
  const { t } = useTranslation("app");
  const session = loadAdminSession();
  const location = useLocation();

  if (!session || session.platformRoleCodes.length === 0) {
    return <Navigate to="/admin/connexion" replace />;
  }
  const superadmin = session.platformRoleCodes.includes("SUPER_ADMIN");
  if (!superadmin && location.pathname.startsWith("/admin/utilisateurs")) return <Navigate to="/admin" replace />;

  function handleLogout(): void {
    clearAdminSession();
    window.location.assign("/admin/connexion");
  }

  return (
    <SidebarShell
      title={t("admin.layout.title")}
      subtitle={session.email}
      links={[...NAV_LINKS.map((link) => ({ to: link.to, label: t(link.key), end: link.to === "/admin" })), ...(superadmin ? [{ to: "/admin/utilisateurs", label: "Utilisateurs", end: false }] : [])]}
      onLogout={handleLogout}
      toneClassName="bg-slate-950"
    >
      <Outlet />
    </SidebarShell>
  );
}
