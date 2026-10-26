import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { listNotifications, markNotificationRead } from "../../lib/communicationApi.js";
import { useRequiredSession } from "../../lib/useSession.js";

export function TeacherCourseNotifications() {
  const session = useRequiredSession();
  const client = useQueryClient();
  const key = ["teacher-course-notifications", session.accessToken, session.tenantId];
  const notifications = useQuery({
    queryKey: key,
    queryFn: () => listNotifications(session.accessToken),
    refetchInterval: 15000,
  });
  const read = useMutation({
    mutationFn: (id: string) => markNotificationRead(id, session.accessToken),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: key });
    },
  });
  const items =
    notifications.data?.filter(
      (n) =>
        n.tenantId === session.tenantId &&
        ["course.review.approved", "course.review.rejected"].includes(n.type),
    ) ?? [];
  return (
    <section className="rounded-xl border bg-white p-5">
      <h2 className="text-xl font-semibold">Notifications sur mes cours</h2>
      {notifications.isPending && <p>Chargement des notifications…</p>}
      {notifications.isError && <p role="alert">Impossible de charger les notifications.</p>}
      {notifications.isSuccess && !items.length && <p>Aucune décision reçue pour le moment.</p>}
      <ul className="space-y-3 mt-3">
        {items.map((n) => (
          <li key={n.id} className="rounded border p-3">
            <p className="font-semibold">
              {n.title} {!n.readAt && <span className="ml-2 text-sm text-teal-700">Non lue</span>}
            </p>
            <p className="mt-1 whitespace-pre-line">{n.body}</p>
            <p className="mt-1 text-xs text-slate-500">{new Date(n.createdAt).toLocaleString("fr-FR")}</p>
            {!n.readAt && (
              <button
                className="mt-2 text-teal-700 underline"
                disabled={read.isPending}
                onClick={() => read.mutate(n.id)}
              >
                Marquer comme lue
              </button>
            )}
          </li>
        ))}
      </ul>
      {read.isError && <p role="alert">Impossible de marquer la notification comme lue.</p>}
      <Link to="/e-learning" className="mt-3 inline-block text-teal-700 underline">
        Consulter mes cours et les motifs de refus
      </Link>
    </section>
  );
}
