import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Navigate } from "react-router-dom";

import { loadAdminSession } from "../../lib/adminSession.js";
import { apiRequest } from "../../lib/apiClient.js";

interface PlatformUser {
  id: string;
  email: string | null;
  status: string;
  profile: { firstName: string; lastName: string } | null;
}
export function AdminUsersPage() {
  const s = loadAdminSession();
  const [search, setSearch] = useState("");
  const allowed = !!s?.platformRoleCodes.includes("SUPER_ADMIN");
  const data = useQuery({
    queryKey: ["platform-users", s?.accessToken, search],
    queryFn: () =>
      apiRequest<PlatformUser[]>(`/platform/users?${new URLSearchParams({ q: search })}`, {
        accessToken: s!.accessToken,
        authContext: "admin",
      }),
    enabled: allowed,
  });
  if (!allowed) return <Navigate to="/admin" replace />;
  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <h1 className="text-2xl font-bold">Utilisateurs</h1>
      <label>
        Rechercher un utilisateur
        <input className="input ml-3" value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>
      {data.isError && <p role="alert">Impossible de charger les utilisateurs.</p>}
      <p className="text-sm text-slate-500">100 comptes maximum par recherche.</p>
      <div className="overflow-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Email</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {data.data?.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="p-3">
                  {u.profile?.firstName} {u.profile?.lastName}
                </td>
                <td>{u.email}</td>
                <td>{u.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
