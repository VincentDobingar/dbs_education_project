import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import type { GridBreak } from "../../components/TimetableGrid.js";
import { apiRequest, type TenantCredentials } from "../../lib/apiClient.js";
import { loadBreaks } from "../../lib/timetableBreaksApi.js";

export function TimetableBreaks({ creds }: { creds: TenantCredentials }) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["timetable-breaks", creds.subdomain],
    queryFn: () => loadBreaks(creds),
  });
  const [edit, setEdit] = useState<GridBreak[] | null>(null);
  const rows = edit ?? query.data ?? [];
  const save = useMutation({
    mutationFn: () =>
      apiRequest<GridBreak[]>("/school-config/timetable-breaks", {
        ...creds,
        method: "PUT",
        body: { breaks: rows },
      }),
    onSuccess: () => {
      setEdit(null);
      void client.invalidateQueries({ queryKey: ["timetable-breaks", creds.subdomain] });
    },
  });
  return (
    <section className="rounded border bg-white p-4 space-y-3">
      <h2 className="font-semibold">Heures de récréation de l'établissement</h2>
      <p className="text-sm">
        Les pauses s'appliquent aux classes de l'année courante. Les cours ne peuvent pas les chevaucher.
      </p>
      {query.isError && <p role="alert">Impossible de charger les récréations.</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="space-y-3"
      >
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap gap-3">
            <label>
              Intitulé
              <input
                required
                className="input block"
                value={r.label}
                onChange={(e) => setEdit(rows.map((v, j) => (j === i ? { ...v, label: e.target.value } : v)))}
              />
            </label>
            <label>
              Début
              <input
                className="input block"
                type="time"
                required
                value={r.startTime}
                onChange={(e) =>
                  setEdit(rows.map((v, j) => (j === i ? { ...v, startTime: e.target.value } : v)))
                }
              />
            </label>
            <label>
              Fin
              <input
                className="input block"
                type="time"
                required
                value={r.endTime}
                onChange={(e) =>
                  setEdit(rows.map((v, j) => (j === i ? { ...v, endTime: e.target.value } : v)))
                }
              />
            </label>
            <fieldset>
              <legend>Jours</legend>
              {["Lu", "Ma", "Me", "Je", "Ve", "Sa", "Di"].map((label, day) => (
                <label key={day} className="mr-2">
                  <input
                    type="checkbox"
                    checked={r.days.includes(day)}
                    onChange={(e) =>
                      setEdit(
                        rows.map((v, j) =>
                          j === i
                            ? {
                                ...v,
                                days: e.target.checked
                                  ? [...v.days, day].sort()
                                  : v.days.filter((d) => d !== day),
                              }
                            : v,
                        ),
                      )
                    }
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            <button type="button" onClick={() => setEdit(rows.filter((_, j) => j !== i))}>
              Retirer la pause
            </button>
          </div>
        ))}
        <button
          type="button"
          className="mr-3 rounded border p-2"
          disabled={rows.length >= 10 || !query.isSuccess}
          onClick={() =>
            setEdit([
              ...rows,
              { label: "Récréation", startTime: "10:00", endTime: "10:15", days: [0, 1, 2, 3, 4, 5] },
            ])
          }
        >
          Ajouter une récréation
        </button>
        <button className="rounded bg-teal-700 p-2 text-white" disabled={save.isPending || !query.isSuccess}>
          Enregistrer les récréations
        </button>
        {save.isSuccess && <p role="status">Récréations enregistrées.</p>}
        {save.isError && (
          <p role="alert">
            Enregistrement impossible : vérifiez les horaires et les chevauchements avec les cours.
          </p>
        )}
      </form>
    </section>
  );
}
