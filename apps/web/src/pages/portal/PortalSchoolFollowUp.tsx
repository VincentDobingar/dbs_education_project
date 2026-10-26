import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "../../lib/apiClient.js";
import type { StudentGrade } from "../../lib/studentPortalApi.js";

interface Incident {
  id: string;
  occurredAt: string;
  description: string;
  severity: string;
  sanction: string | null;
  correctiveAction: string | null;
}

export function PortalSchoolFollowUp({
  studentId,
  accessToken,
  parent = false,
}: {
  studentId: string;
  accessToken: string;
  parent?: boolean;
}) {
  const base = parent ? `/parent-portal/children/${studentId}` : `/student-portal/students/${studentId}`;
  const incidents = useQuery({
    queryKey: ["portal-incidents", base, accessToken],
    queryFn: () => apiRequest<Incident[]>(`${base}/incidents`, { accessToken, authContext: "portal" }),
    gcTime: 0,
    retry: false,
  });
  const grades = useQuery({
    queryKey: ["portal-parent-grades", base, accessToken],
    queryFn: () => apiRequest<StudentGrade[]>(`${base}/grades`, { accessToken, authContext: "portal" }),
    enabled: parent,
    gcTime: 0,
    retry: false,
  });
  return (
    <>
      {parent && (
        <section className="rounded-lg border bg-white p-5">
          <h2 className="text-lg font-semibold">Notes publiées</h2>
          {grades.isPending ? (
            <p>Chargement…</p>
          ) : grades.isError ? (
            <p role="alert">Impossible de charger les notes.</p>
          ) : !grades.data?.length ? (
            <p>Aucune note publiée.</p>
          ) : (
            <ul>
              {grades.data.map((g) => (
                <li className="border-b py-2" key={g.id}>
                  {g.assessment.subject.nameFr} · {g.assessment.title} :{" "}
                  {g.isAbsent ? "Absent" : `${g.score ?? "—"} / ${g.assessment.maxScore}`}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <section className="rounded-lg border bg-white p-5">
        <h2 className="text-lg font-semibold">Discipline</h2>
        {incidents.isPending ? (
          <p>Chargement…</p>
        ) : incidents.isError ? (
          <p role="alert">Impossible de charger les incidents.</p>
        ) : !incidents.data?.length ? (
          <p>Aucun incident enregistré.</p>
        ) : (
          <ul>
            {incidents.data.map((i) => (
              <li className="border-b py-2" key={i.id}>
                <p>
                  {i.occurredAt.slice(0, 10)} ·{" "}
                  {
                    ({ MINOR: "Mineure", MODERATE: "Modérée", SEVERE: "Grave" } as Record<string, string>)[
                      i.severity
                    ]
                  }{" "}
                  · {i.description}
                </p>
                {i.sanction && <p>Sanction : {i.sanction}</p>}
                {i.correctiveAction && <p>Action corrective : {i.correctiveAction}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
