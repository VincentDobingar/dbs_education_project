export interface GridLesson {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  label: string;
  detail?: string;
}
export interface GridBreak {
  label: string;
  startTime: string;
  endTime: string;
  days: number[];
}
export function TimetableGrid({
  lessons,
  breaks = [],
  onRemove,
}: {
  lessons: GridLesson[];
  breaks?: GridBreak[];
  onRemove?: ((id: string) => void) | undefined;
}) {
  const boundaries = [
    ...new Set([
      ...lessons.flatMap((e) => [e.startTime, e.endTime]),
      ...breaks.flatMap((b) => [b.startTime, b.endTime]),
    ]),
  ].sort();
  const slots = boundaries.slice(0, -1).map((start, i) => ({ start, end: boundaries[i + 1]! }));
  if (!slots.length) return <p>Aucun créneau enregistré.</p>;
  return (
    <div className="overflow-x-auto rounded border bg-white">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="p-2 text-left text-slate-600">Heures en lignes, jours en colonnes</caption>
        <thead>
          <tr className="bg-slate-100">
            <th scope="col" className="sticky left-0 bg-slate-100 p-3">
              Heures
            </th>
            {["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"].map((day) => (
              <th key={day} scope="col" className="min-w-32 border-l p-3">
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slots.map((s) => (
            <tr key={s.start} className="border-t">
              <th scope="row" className="sticky left-0 bg-white p-3">
                {s.start} – {s.end}
              </th>
              {[0, 1, 2, 3, 4, 5, 6].map((index) => {
                const pauses = breaks.filter(
                  (b) => b.days.includes(index) && s.start < b.endTime && b.startTime < s.end,
                );
                const courses = lessons.filter(
                  (e) => e.dayOfWeek === index && s.start < e.endTime && e.startTime < s.end,
                );
                return (
                  <td
                    key={index}
                    className={`border-l p-3 align-top ${pauses.length ? "bg-amber-50 text-amber-900" : ""}`}
                  >
                    {pauses.map((b, i) => (
                      <p key={i} className="font-medium">
                        {b.label}
                      </p>
                    ))}
                    {courses.map((e) => (
                      <div key={e.id} className="rounded bg-teal-50 p-2">
                        <p className="font-semibold">{e.label}</p>
                        {e.detail && <p>{e.detail}</p>}
                        {onRemove && (
                          <button className="text-xs underline" onClick={() => onRemove(e.id)}>
                            Retirer ce créneau
                          </button>
                        )}
                      </div>
                    ))}
                    {!pauses.length && !courses.length && "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
