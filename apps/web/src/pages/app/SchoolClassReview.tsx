import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { listAttendance } from "../../lib/attendanceApi.js";
import { listIncidents } from "../../lib/disciplineApi.js";
import { listAssessments, listGradesForAssessment, publishAssessment } from "../../lib/gradingApi.js";
import { listHomework } from "../../lib/homeworkApi.js";
import { HOMEWORK_KINDS } from "../../lib/homeworkKinds.js";
import { listAcademicYears, listClassrooms, listSubjects } from "../../lib/schoolConfigApi.js";
import { listStudents } from "../../lib/studentsApi.js";
import { useRequiredSession } from "../../lib/useSession.js";

export type ClassReviewKind = "attendance" | "grades" | "homework" | "discipline";
export function SchoolClassReview({ kind }: { kind: ClassReviewKind }) {
  const session = useRequiredSession();
  const client = useQueryClient();
  const canPublish = session.roleCodes.some((r) =>
    ["SCHOOL_OWNER", "DIRECTOR", "ACADEMIC_DIRECTOR"].includes(r),
  );
  const creds = { accessToken: session.accessToken, subdomain: session.subdomain };
  const [selected, setSelected] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const rooms = useQuery({
    queryKey: ["classrooms", session.subdomain],
    queryFn: () => listClassrooms(creds),
  });
  const years = useQuery({
    queryKey: ["academic-years", session.subdomain],
    queryFn: () => listAcademicYears(creds),
  });
  const current = years.data?.find((y) => y.isCurrent);
  const classes = rooms.data?.filter((c) => c.academicYearId === current?.id) ?? [];
  const classroomId = selected || classes[0]?.id || "";
  const roster = useQuery({
    queryKey: ["class-review-roster", session.accessToken, classroomId],
    queryFn: () => listStudents(creds, classroomId),
    enabled: !!classroomId,
  });
  const subjects = useQuery({
    queryKey: ["subjects", session.subdomain],
    queryFn: () => listSubjects(creds),
    enabled: kind === "grades",
  });
  const attendance = useQuery({
    queryKey: ["class-review-attendance", session.accessToken, classroomId, date],
    queryFn: () => listAttendance(creds, { classroomId, date }),
    enabled: !!classroomId && kind === "attendance",
  });
  const assessments = useQuery({
    queryKey: ["class-review-assessments", session.accessToken, classroomId],
    queryFn: () => listAssessments(creds, { classroomId }),
    enabled: !!classroomId && kind === "grades",
  });
  const publication = useMutation({
    mutationFn: (id: string) => publishAssessment(id, creds),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["class-review-assessments", session.accessToken] });
    },
  });
  const scores = useQuery({
    queryKey: ["class-review-scores", session.accessToken, classroomId, assessments.data?.map((a) => a.id)],
    queryFn: async () =>
      (await Promise.all((assessments.data ?? []).map((a) => listGradesForAssessment(a.id, creds)))).flat(),
    enabled: !!classroomId && kind === "grades" && assessments.isSuccess,
  });
  const homework = useQuery({
    queryKey: ["class-review-homework", session.accessToken, classroomId],
    queryFn: () => listHomework(creds, { classroomId }),
    enabled: !!classroomId && kind === "homework",
  });
  const incidents = useQuery({
    queryKey: ["class-review-incidents", session.accessToken, classroomId],
    queryFn: () => listIncidents(creds, undefined, classroomId),
    enabled: !!classroomId && kind === "discipline",
  });
  const title = {
    attendance: "Liste de présence",
    grades: "Notes",
    homework: "Devoirs et travaux",
    discipline: "Discipline",
  }[kind];
  const data =
    kind === "attendance"
      ? attendance
      : kind === "grades"
        ? scores
        : kind === "homework"
          ? homework
          : incidents;
  const studentName = (id: string) => {
    const s = roster.data?.find((x) => x.id === id);
    return s ? `${s.lastName} ${s.firstName}` : "Élève";
  };
  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-slate-600">Consultation des informations saisies par les enseignants.</p>
      {publication.isError && <p role="alert">La publication a échoué. Vérifiez vos droits et réessayez.</p>}
      <div className="flex flex-wrap gap-4">
        <label>
          Classe
          <select className="input ml-3" value={classroomId} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Choisir une classe</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {kind === "attendance" && (
          <label>
            Date
            <input
              className="input ml-3"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
        )}
      </div>
      {kind === "grades" && canPublish && assessments.isSuccess && (
        <section className="rounded border bg-white p-4" aria-label="Publication des notes">
          <h2 className="font-semibold">Publication des notes</h2>
          <p className="text-sm text-slate-600">
            Les notes restent privées jusqu’à publication par la direction ou le propriétaire.
          </p>
          {assessments.data
            .filter((a) => !a.isPublished)
            .map((a) => (
              <div key={a.id} className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <span>{a.title}</span>
                <button
                  className="rounded bg-teal-700 px-4 py-2 text-white"
                  disabled={publication.isPending}
                  onClick={() => publication.mutate(a.id)}
                >
                  Publier {a.title}
                </button>
              </div>
            ))}
          {!assessments.data.some((a) => !a.isPublished) && (
            <p className="mt-2">Toutes les évaluations de cette classe sont publiées.</p>
          )}
        </section>
      )}
      {(rooms.isError ||
        years.isError ||
        roster.isError ||
        data.isError ||
        (kind === "grades" && assessments.isError)) && (
        <p role="alert">Impossible de charger les informations de la classe.</p>
      )}
      {(rooms.isPending || years.isPending || (!!classroomId && (roster.isPending || data.isPending))) && (
        <p>Chargement…</p>
      )}
      {years.isSuccess && rooms.isSuccess && !classes.length && <p>Aucune classe pour l'année en cours.</p>}
      {!!classroomId && (
        <div className="overflow-auto rounded border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100">
              <tr>
                {kind === "attendance" && (
                  <>
                    <th className="p-3">Élève</th>
                    <th>Présence enregistrée</th>
                    <th>Justification</th>
                  </>
                )}
                {kind === "grades" && (
                  <>
                    <th className="p-3">Élève</th>
                    {assessments.data?.map((a) => (
                      <th key={a.id} className="p-3">
                        {subjects.data?.find((s) => s.id === a.subjectId)?.nameFr} · {a.title} /{a.maxScore}
                        {!a.isPublished && " (brouillon)"}
                      </th>
                    ))}
                  </>
                )}
                {kind === "homework" && (
                  <>
                    <th className="p-3">Type</th>
                    <th>Titre</th>
                    <th>Consignes</th>
                    <th>Échéance</th>
                  </>
                )}
                {kind === "discipline" && (
                  <>
                    <th className="p-3">Élève</th>
                    <th>Date</th>
                    <th>Incident</th>
                    <th>Gravité</th>
                    <th>Sanction</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {kind === "attendance" &&
                roster.data?.map((s) => {
                  const saved = attendance.data?.filter((a) => a.studentId === s.id) ?? [];
                  return (
                    <tr key={s.id} className="border-t">
                      <td className="p-3">{studentName(s.id)}</td>
                      <td>
                        {saved.length
                          ? saved
                              .map(
                                (a) =>
                                  ({
                                    PRESENT: "Présent",
                                    ABSENT: "Absent",
                                    LATE: "En retard",
                                    EXCUSED: "Excusé",
                                  })[a.status],
                              )
                              .join(" · ")
                          : "Non renseignée"}
                      </td>
                      <td>
                        {saved
                          .map((a) => a.justificationNote)
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </td>
                    </tr>
                  );
                })}
              {kind === "grades" &&
                roster.data?.map((s) => (
                  <tr key={s.id} className="border-t">
                    <td className="p-3">{studentName(s.id)}</td>
                    {assessments.data?.map((a) => {
                      const g = scores.data?.find((g) => g.assessmentId === a.id && g.studentId === s.id);
                      return (
                        <td key={a.id} className="p-3">
                          {g?.isAbsent ? "Absent" : (g?.score ?? "—")}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              {kind === "homework" &&
                homework.data?.map((h) => (
                  <tr key={h.id} className="border-t">
                    <td className="p-3">{HOMEWORK_KINDS[h.kind ?? "HOMEWORK"]}</td>
                    <td>{h.title}</td>
                    <td className="whitespace-pre-line p-3">{h.instructions ?? "—"}</td>
                    <td>{h.dueAt.slice(0, 10)}</td>
                  </tr>
                ))}
              {kind === "discipline" &&
                incidents.data?.map((i) => (
                  <tr key={i.id} className="border-t">
                    <td className="p-3">{studentName(i.studentId)}</td>
                    <td>{i.occurredAt.slice(0, 10)}</td>
                    <td className="p-3">{i.description}</td>
                    <td>{{ MINOR: "Mineure", MODERATE: "Modérée", SEVERE: "Grave" }[i.severity]}</td>
                    <td>{i.sanction ?? "—"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      {!!classroomId &&
        data.isSuccess &&
        ((kind === "homework" && !homework.data?.length) ||
          (kind === "discipline" && !incidents.data?.length) ||
          (kind === "grades" && !assessments.data?.length)) && (
          <p>Aucune information enregistrée pour cette classe.</p>
        )}
    </div>
  );
}
