import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, Outlet } from "react-router-dom";

import { SidebarShell } from "../components/SidebarShell.js";
import { clearPortalSession, loadPortalSession } from "../lib/portalSession.js";

const NAV_LINKS = [
  { to: "/portail/parent", key: "portal.nav.parent" },
  { to: "/portail/eleve", key: "portal.nav.student" },
  { to: "/portail/activation", key: "portal.nav.redeem" },
  { to: "/portail/aide", key: "portal.nav.guide" },
] as const;

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
    <SidebarShell
      title={t("portal.title")}
      subtitle={session.email}
      links={NAV_LINKS.map((link) => ({ to: link.to, label: t(link.key) }))}
      onLogout={handleLogout}
    >
      <Outlet />
    </SidebarShell>
  );
}
