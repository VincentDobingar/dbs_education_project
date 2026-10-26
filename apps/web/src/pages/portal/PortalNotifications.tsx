import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { apiRequest } from "../../lib/apiClient.js";
import type { Notification } from "../../lib/communicationApi.js";
import { notificationHref } from "../../lib/notificationTarget.js";

export function PortalNotifications({ accessToken, studentMode = false }: { accessToken: string; studentMode?: boolean }) {
  const client = useQueryClient();
  const key = ["portal-school-notifications", accessToken];
  const notifications = useQuery({
    queryKey: key,
    queryFn: () =>
      apiRequest<Notification[]>("/communication/notifications", { accessToken, authContext: "portal" }),
    refetchInterval: 15000,
    gcTime: 0,
  });
  const read = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/communication/notifications/${id}/read`, {
        method: "PATCH",
        accessToken,
        authContext: "portal",
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: key });
    },
  });
  const items =
    notifications.data?.filter(
      (n) =>
        n.channel === "IN_APP" &&
        ["grade.published", "homework.added", "attendance.absence", "discipline.incident"].includes(n.type),
    ) ?? [];
  return (
    <section className="m-6 rounded-xl border bg-white p-5" aria-label="Notifications scolaires">
      <h2 className="text-xl font-semibold">
        Notifications scolaires{" "}
        {items.some((n) => !n.readAt) && (
          <span className="text-sm text-teal-700">({items.filter((n) => !n.readAt).length} non lues)</span>
        )}
      </h2>
      {notifications.isPending && <p>Chargement…</p>}
      {notifications.isError && <p role="alert">Impossible de charger les notifications.</p>}
      {notifications.isSuccess && !items.length && <p>Aucune notification scolaire pour le moment.</p>}
      <div className="mt-3 max-h-80 overflow-y-auto">
        <ul className="space-y-3">
          {items.map((n) => (
            <li key={n.id} className="rounded border p-3">
              <p className="font-semibold">
                {notificationHref(n, studentMode) ? <Link className="text-teal-700 underline" to={notificationHref(n, studentMode)!}>{n.title}</Link> : n.title}
                {!n.readAt && " · Non lue"}
              </p>
              <p>{n.body}</p>
              <p className="text-xs text-slate-500">{new Date(n.createdAt).toLocaleString("fr-FR")}</p>
              {!n.readAt && (
                <button
                  disabled={read.isPending}
                  className="text-teal-700 underline"
                  onClick={() => read.mutate(n.id)}
                >
                  Marquer comme lue
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
      {read.isError && <p role="alert">Impossible de marquer la notification comme lue.</p>}
    </section>
  );
}
