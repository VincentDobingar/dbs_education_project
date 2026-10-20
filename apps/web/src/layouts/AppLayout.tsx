import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";

import { SidebarShell } from "../components/SidebarShell.js";
import { getTenantLogo } from "../lib/schoolConfigApi.js";
import { ACCESS_GRANTING_STATUSES, getSchoolSubscription } from "../lib/schoolSubscriptionApi.js";
import { clearSession, loadSession } from "../lib/session.js";

/**
 * `roles` reflète les rôles qui détiennent la permission de *lecture* gardant la
 * route GET consultée par cette page (voir `requirePermission(...)` dans le module
 * apps/api correspondant et `ROLE_PERMISSIONS` dans prisma/seed/data/roles-permissions.ts) —
 * un lien omettant `roles` correspond à une route sans permission dédiée (accessible
 * à tout membre authentifié du tenant : tableau de bord, emplois du temps, support).
 * Avant ce filtre, tout le personnel voyait tous les liens, y compris vers des
 * modules où la moindre action renvoyait 403 (audit design/sécurité 2026-09-22).
 */
interface NavLinkDef {
  to: string;
  key: string;
  roles?: readonly string[];
}

const NAV_LINKS: readonly NavLinkDef[] = [
  { to: "/tableau-de-bord", key: "layout.nav.dashboard" },
  {
    to: "/eleves",
    key: "layout.nav.students",
    roles: [
      "SCHOOL_OWNER",
      "SCHOOL_ADMIN",
      "DIRECTOR",
      "ACADEMIC_DIRECTOR",
      "SECRETARY",
      "TEACHER",
      "TENANT_AUDITOR",
    ],
  },
  { to: "/utilisateurs", key: "layout.nav.users", roles: ["SCHOOL_OWNER", "SCHOOL_ADMIN"] },
  { to: "/personnel", key: "layout.nav.employees", roles: ["SCHOOL_OWNER", "HR_MANAGER"] },
  { to: "/emplois-du-temps", key: "layout.nav.timetable" },
  {
    to: "/presences",
    key: "layout.nav.attendance",
    roles: [
      "SCHOOL_OWNER",
      "SCHOOL_ADMIN",
      "DIRECTOR",
      "ACADEMIC_DIRECTOR",
      "TEACHER",
      "SUPERVISOR",
      "TENANT_AUDITOR",
    ],
  },
  {
    to: "/discipline",
    key: "layout.nav.discipline",
    roles: [
      "SCHOOL_OWNER",
      "SCHOOL_ADMIN",
      "DIRECTOR",
      "ACADEMIC_DIRECTOR",
      "TEACHER",
      "SUPERVISOR",
      "TENANT_AUDITOR",
    ],
  },
  {
    to: "/notes",
    key: "layout.nav.grading",
    roles: ["SCHOOL_OWNER", "SCHOOL_ADMIN", "DIRECTOR", "ACADEMIC_DIRECTOR", "TEACHER", "TENANT_AUDITOR"],
  },
  {
    to: "/bulletins",
    key: "layout.nav.reportCards",
    roles: ["SCHOOL_OWNER", "SCHOOL_ADMIN", "DIRECTOR", "ACADEMIC_DIRECTOR", "TEACHER", "TENANT_AUDITOR"],
  },
  {
    to: "/finances",
    key: "layout.nav.finance",
    roles: ["SCHOOL_OWNER", "SCHOOL_ADMIN", "DIRECTOR", "ACCOUNTANT", "TENANT_AUDITOR"],
  },
  {
    to: "/devoirs",
    key: "layout.nav.homework",
    roles: ["SCHOOL_OWNER", "SCHOOL_ADMIN", "DIRECTOR", "ACADEMIC_DIRECTOR", "TEACHER", "TENANT_AUDITOR"],
  },
  { to: "/annonces", key: "layout.nav.announcements", roles: ["SCHOOL_OWNER", "SCHOOL_ADMIN", "DIRECTOR"] },
  { to: "/support", key: "layout.nav.support" },
  {
    to: "/bibliotheque",
    key: "layout.nav.library",
    roles: ["SCHOOL_OWNER", "SCHOOL_ADMIN", "LIBRARIAN", "TENANT_AUDITOR"],
  },
  {
    to: "/transport",
    key: "layout.nav.transport",
    roles: ["SCHOOL_OWNER", "SCHOOL_ADMIN", "TRANSPORT_MANAGER", "TENANT_AUDITOR"],
  },
  {
    to: "/cantine",
    key: "layout.nav.cafeteria",
    roles: ["SCHOOL_OWNER", "SCHOOL_ADMIN", "CAFETERIA_MANAGER", "TENANT_AUDITOR"],
  },
  {
    to: "/internat",
    key: "layout.nav.boarding",
    roles: ["SCHOOL_OWNER", "SCHOOL_ADMIN", "BOARDING_MANAGER", "TENANT_AUDITOR"],
  },
  {
    to: "/e-learning",
    key: "layout.nav.elearning",
    roles: ["SCHOOL_OWNER", "SCHOOL_ADMIN", "DIRECTOR", "ACADEMIC_DIRECTOR", "TEACHER", "TENANT_AUDITOR"],
  },
  { to: "/configuration", key: "layout.nav.configuration", roles: ["SCHOOL_OWNER", "SCHOOL_ADMIN"] },
  // GET /subscriptions/school n'exige aucune permission ; seul SCHOOL_OWNER détient
  // subscriptions.manage pour souscrire (la page l'explique aux autres).
  { to: "/abonnement", key: "layout.nav.subscription", roles: ["SCHOOL_OWNER", "SCHOOL_ADMIN", "DIRECTOR"] },
];

function isNavLinkVisible(roles: readonly string[] | undefined, userRoleCodes: readonly string[]): boolean {
  if (!roles) {
    return true;
  }
  return userRoleCodes.some((code) => roles.includes(code));
}

export function AppLayout(): ReactNode {
  const { t } = useTranslation("app");
  const session = loadSession();
  const location = useLocation();

  // Le logo n'est pas dans la session (posé une fois à la connexion) : un
  // changement fait depuis Configuration doit apparaître ici sans se reconnecter,
  // donc une requête à part plutôt qu'un champ figé dans le token.
  const tenantLogo = useQuery({
    queryKey: ["tenant-logo", session?.subdomain],
    queryFn: () => getTenantLogo({ accessToken: session!.accessToken, subdomain: session!.subdomain }),
    enabled: Boolean(session),
  });
  // Sans abonnement actif, presque tous les modules répondent 402 : un bandeau
  // explique pourquoi et mène à la page Abonnement, plutôt qu'une suite d'erreurs
  // génériques page après page.
  const subscription = useQuery({
    queryKey: ["school-subscription-banner", session?.subdomain],
    queryFn: () =>
      getSchoolSubscription({ accessToken: session!.accessToken, subdomain: session!.subdomain }),
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

  const links = NAV_LINKS.filter((link) => isNavLinkVisible(link.roles, session.roleCodes)).map((link) => ({
    to: link.to,
    label: t(link.key),
  }));

  const subscriptionInactive =
    subscription.isSuccess &&
    (subscription.data === null || !ACCESS_GRANTING_STATUSES.has(subscription.data.status));
  const banner =
    subscriptionInactive && location.pathname !== "/abonnement" ? (
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-6 py-3 text-sm text-amber-900">
        <p>{t("subscription.banner.inactive")}</p>
        <Link to="/abonnement" className="font-semibold underline hover:text-amber-950">
          {t("subscription.banner.cta")}
        </Link>
      </div>
    ) : null;

  return (
    <SidebarShell
      title={session.tenantName}
      subtitle={session.email}
      logo={
        logoUrl ? (
          <img
            src={logoUrl}
            alt=""
            className="h-10 w-10 shrink-0 rounded-md bg-white object-contain p-1"
            onError={() => setLogoLoadFailed(true)}
          />
        ) : null
      }
      links={links}
      onLogout={handleLogout}
      banner={banner}
    >
      <Outlet />
    </SidebarShell>
  );
}
