import { useQuery } from "@tanstack/react-query";

import { TimetableGrid } from "../../components/TimetableGrid.js";
import { apiRequest } from "../../lib/apiClient.js";
import { loadBreaks } from "../../lib/timetableBreaksApi.js";
import { useRequiredSession } from "../../lib/useSession.js";


export function MyTimetable() {
  const s = useRequiredSession();
  const entries = useQuery({
    queryKey: ["my-timetable", s.subdomain, s.accessToken],
    queryFn: () =>
      apiRequest<
        {
          id: string;
          dayOfWeek: number;
          startTime: string;
          endTime: string;
          roomLabel: string | null;
          subject: { nameFr: string };
          timetable: { classroom: { name: string } };
        }[]
      >("/school-config/my-timetable", { accessToken: s.accessToken, subdomain: s.subdomain }),
  });
  const breaks = useQuery({
    queryKey: ["timetable-breaks", s.subdomain],
    queryFn: () => loadBreaks({ accessToken: s.accessToken, subdomain: s.subdomain }),
  });
  return (
    <div className="mx-auto max-w-5xl p-8">
      <h1 className="text-2xl font-bold">Mon emploi du temps</h1>
      <p className="my-3">Vos cours uniquement, pour l'année académique en cours.</p>
      {entries.isError && <p role="alert">Impossible de charger votre emploi du temps.</p>}
      {entries.isSuccess && !entries.data.length && <p>Aucun créneau affecté pour le moment.</p>}
      <TimetableGrid
        lessons={(entries.data ?? []).map((e) => ({
          ...e,
          label: e.subject.nameFr,
          detail: `${e.timetable.classroom.name} · ${e.roomLabel ?? ""}`,
        }))}
        breaks={breaks.data ?? []}
      />
    </div>
  );
}
