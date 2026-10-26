import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { SidebarShell } from "../components/SidebarShell.js";
import { listLinkedStudents, listMyChildren } from "../lib/familyApi.js";
import { clearPortalSession, loadPortalSession } from "../lib/portalSession.js";
import { PortalNotifications } from "../pages/portal/PortalNotifications.js";

export function PortalLayout(): ReactNode {
  const session = loadPortalSession();
  const location = useLocation();
  const roles = useQuery({
    queryKey: ["portal-roles", session?.accessToken],
    enabled: !!session,
    queryFn: async () => {
      const [children, students] = await Promise.all([
        listMyChildren(session!.accessToken),
        listLinkedStudents(session!.accessToken),
      ]);
      return { parent: children.length > 0, student: students.length > 0 };
    },
    gcTime: 0,
    retry: false,
  });
  if (!session) return <Navigate to="/portail/connexion" replace />;
  if (roles.isPending) return <p className="p-10">Chargement de votre espace…</p>;
  if (roles.isError)
    return (
      <div className="p-10">
        <p role="alert">Impossible de vérifier vos espaces.</p>
        <button onClick={() => void roles.refetch()}>Réessayer</button>
      </div>
    );
  const studentMode =
    location.pathname.startsWith("/portail/eleve") || (!roles.data.parent && roles.data.student);
  if (studentMode && !roles.data.student)
    return <Navigate to={roles.data.parent ? "/portail/parent" : "/portail/activation"} replace />;
  if (
    (location.pathname.startsWith("/portail/parent") || location.pathname === "/portail/profil") &&
    !roles.data.parent
  )
    return <Navigate to={roles.data.student ? "/portail/eleve" : "/portail/activation"} replace />;
  const links = [];
  if (roles.data.parent)
    links.push({ to: "/portail/parent", label: roles.data.student ? "Espace parent" : "Mes enfants" });
  if (roles.data.student)
    links.push({ to: "/portail/eleve", label: roles.data.parent ? "Espace élève" : "Mon dashboard élève" });
  if (studentMode) links.push({ to: "/portail/eleve/profil", label: "Mon profil élève" });
  else if (roles.data.parent) links.push({ to: "/portail/profil", label: "Mon profil parent" });
  if (!studentMode && roles.data.parent)
    links.push({ to: "/portail/abonnements", label: "Mes abonnements famille" });
  links.push(
    { to: "/portail/activation", label: "Activer un code" },
    { to: "/portail/aide", label: "Guide d'utilisation" },
  );
  return (
    <SidebarShell
      title={studentMode ? "Espace élève" : "Espace parent / tuteur"}
      subtitle={session.email}
      links={links}
      onLogout={() => {
        clearPortalSession();
        window.location.assign("/portail/connexion");
      }}
    >
      <PortalNotifications accessToken={session.accessToken} />
      <Outlet />
    </SidebarShell>
  );
}
