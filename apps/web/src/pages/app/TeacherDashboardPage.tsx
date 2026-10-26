import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ApiError, type TenantCredentials } from "../../lib/apiClient.js";
import { formText } from "../../lib/formData.js";
import {
  getTeacherWorkspace,
  getTeacherAttendance,
  getTeacherClassroom,
  getTeacherGrades,
  saveTeacherAttendance,
  saveTeacherGrades,
  createTeacherAssessment,
  type TeacherWorkspace,
} from "../../lib/teacherApi.js";
import { useRequiredSession } from "../../lib/useSession.js";

import { TeacherCourseNotifications } from "./TeacherCourseNotifications.js";

function ClassroomWork({
  id,
  creds,
  workspace,
}: {
  id: string;
  creds: TenantCredentials;
  workspace: TeacherWorkspace;
}) {
  const client = useQueryClient();
  const data = useQuery({
    queryKey: ["teacher-classroom", creds.subdomain, id],
    queryFn: () => getTeacherClassroom(id, creds),
    gcTime: 0,
  });
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const previousAttendance = useQuery({
    queryKey: ["teacher-attendance", creds.subdomain, id, date],
    queryFn: () => getTeacherAttendance(id, date, creds),
    gcTime: 0,
  });
  const [gradeError, setGradeError] = useState<string | null>(null);
  const [assessmentId, setAssessmentId] = useState("");
  const grades = useQuery({
    queryKey: ["teacher-grades", creds.subdomain, id, assessmentId],
    queryFn: () => getTeacherGrades(id, assessmentId, creds),
    enabled: !!assessmentId,
    gcTime: 0,
  });
  const attendance = useMutation({
    mutationFn: (entries: { studentId: string; status: string }[]) =>
      saveTeacherAttendance(id, { date, entries }, creds),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["teacher-attendance", creds.subdomain, id, date] });
    },
  });
  const scores = useMutation({
    mutationFn: (entries: { studentId: string; score?: number; isAbsent: boolean }[]) =>
      saveTeacherGrades(id, assessmentId, { grades: entries }, creds),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["teacher-grades", creds.subdomain, id, assessmentId] });
    },
  });
  const create = useMutation({
    mutationFn: (form: FormData) =>
      createTeacherAssessment(
        id,
        {
          title: formText(form, "title"),
          maxScore: Number(formText(form, "maxScore")),
          academicPeriodId: formText(form, "period"),
          assessmentTypeId: formText(form, "type"),
        },
        creds,
      ),
    onSuccess: (a) => {
      void client.invalidateQueries({ queryKey: ["teacher-classroom", creds.subdomain, id] });
      setAssessmentId(a.id);
    },
  });
  if (data.isPending) return <p>Chargement de votre classe…</p>;
  if (data.isError) return <p role="alert">Impossible de charger cette affectation.</p>;
  const selected = data.data.assessments.find((a) => a.id === assessmentId);
  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-white p-5">
        <h2 className="text-xl font-semibold">Liste de présence</h2>
        <form
          key={id + date + previousAttendance.dataUpdatedAt}
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            attendance.mutate(
              data.data.students.map((s) => ({ studentId: s.id, status: formText(form, s.id) })),
            );
          }}
        >
          <label className="my-3 block">
            Date de l'appel
            <input
              type="date"
              value={date}
              required
              onChange={(e) => setDate(e.target.value)}
              className="ml-3 rounded border p-2"
            />
          </label>
          <p className="mb-3 text-sm text-slate-600">
            Vérifiez chaque statut avant d'enregistrer. L'enregistrement remplace l'appel pour cette matière
            et cette date.
          </p>
          {data.data.students.map((s) => (
            <label key={s.id} className="flex items-center justify-between gap-3 border-b py-2">
              {s.lastName} {s.firstName}
              <select
                name={s.id}
                className="rounded border p-2"
                disabled={!previousAttendance.isSuccess || previousAttendance.isFetching}
                defaultValue={previousAttendance.data?.find((a) => a.studentId === s.id)?.status ?? "PRESENT"}
              >
                <option value="PRESENT">Présent</option>
                <option value="ABSENT">Absent</option>
                <option value="LATE">En retard</option>
                <option value="EXCUSED">Excusé</option>
              </select>
            </label>
          ))}
          <button
            className="mt-3 rounded bg-teal-600 px-4 py-2 text-white disabled:opacity-50"
            disabled={
              attendance.isPending ||
              !data.data.students.length ||
              !previousAttendance.isSuccess ||
              previousAttendance.isFetching
            }
          >
            Enregistrer les présences
          </button>
          {previousAttendance.isError && (
            <p role="alert">Impossible de charger l’appel existant. Réessayez avant d’enregistrer.</p>
          )}
          {attendance.isSuccess && <p role="status">Appel enregistré.</p>}
          {attendance.isError && <p role="alert">Impossible d'enregistrer l'appel.</p>}
        </form>
      </section>
      <section className="rounded-xl border bg-white p-5">
        <h2 className="text-xl font-semibold">Saisie des notes</h2>
        <label className="my-3 block">
          Évaluation
          <select
            value={assessmentId}
            onChange={(e) => setAssessmentId(e.target.value)}
            className="ml-3 max-w-full rounded border p-2"
          >
            <option value="">Choisir une évaluation</option>
            {data.data.assessments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title} {a.isPublished ? "· publiée (lecture seule)" : "· brouillon"}
              </option>
            ))}
          </select>
        </label>
        {selected && grades.isPending ? <p>Chargement des notes…</p> : null}
        {grades.isError && <p role="alert">Impossible de charger les notes.</p>}
        {selected && grades.isSuccess && (
          <form
            key={assessmentId + grades.dataUpdatedAt}
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              setGradeError(null);
              if (
                data.data.students.some(
                  (s) => form.get("absent-" + s.id) !== "on" && !formText(form, "score-" + s.id).trim(),
                )
              ) {
                setGradeError("Renseignez une note ou cochez Absent pour chaque élève.");
                return;
              }
              scores.mutate(
                data.data.students.map((s) => {
                  const isAbsent = form.get("absent-" + s.id) === "on";
                  return {
                    studentId: s.id,
                    ...(!isAbsent ? { score: Number(formText(form, "score-" + s.id)) } : {}),
                    isAbsent,
                  };
                }),
              );
            }}
          >
            <p className="text-sm text-slate-600">
              Barème : {selected.maxScore}. Les évaluations publiées sont verrouillées.
            </p>
            {data.data.students.map((s) => {
              const g = grades.data.find((g) => g.studentId === s.id);
              return (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-2">
                  <span>
                    {s.lastName} {s.firstName}
                  </span>
                  <label>
                    Note
                    <input
                      aria-label={`Note de ${s.firstName} ${s.lastName}`}
                      name={"score-" + s.id}
                      type="number"
                      min="0"
                      max={Number(selected.maxScore)}
                      step="0.01"
                      defaultValue={g?.score ?? ""}
                      disabled={selected.isPublished}
                      className="ml-2 w-24 rounded border p-2"
                    />
                  </label>
                  <label>
                    <input
                      name={"absent-" + s.id}
                      type="checkbox"
                      defaultChecked={g?.isAbsent ?? false}
                      disabled={selected.isPublished}
                    />{" "}
                    Absent
                  </label>
                </div>
              );
            })}
            <button
              className="mt-3 rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
              disabled={scores.isPending || selected.isPublished || !data.data.students.length}
            >
              Enregistrer les notes
            </button>
            {gradeError && (
              <p role="alert" className="text-red-700">
                {gradeError}
              </p>
            )}
            {scores.isSuccess && <p role="status">Notes enregistrées.</p>}
            {scores.isError && (
              <p role="alert">
                {scores.error instanceof ApiError
                  ? scores.error.message
                  : "Impossible d'enregistrer les notes."}
              </p>
            )}
          </form>
        )}
        <details className="mt-5 border-t pt-4">
          <summary className="cursor-pointer font-semibold">Créer une évaluation</summary>
          <form
            className="mt-3 grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate(new FormData(e.currentTarget));
            }}
          >
            <label>
              Intitulé
              <input name="title" required maxLength={150} className="mt-1 block w-full rounded border p-2" />
            </label>
            <label>
              Barème
              <input
                name="maxScore"
                type="number"
                min="1"
                defaultValue="20"
                required
                className="mt-1 block w-full rounded border p-2"
              />
            </label>
            <label>
              Période
              <select name="period" required className="mt-1 block w-full rounded border p-2">
                {workspace.periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Type
              <select name="type" required className="mt-1 block w-full rounded border p-2">
                {workspace.assessmentTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nameFr}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="rounded bg-teal-600 px-4 py-2 text-white disabled:opacity-50"
              disabled={create.isPending || !workspace.periods.length || !workspace.assessmentTypes.length}
            >
              Créer le brouillon
            </button>
            {create.isError && <p role="alert">Impossible de créer l'évaluation.</p>}
          </form>
        </details>
      </section>
    </div>
  );
}
export function TeacherDashboardPage() {
  const session = useRequiredSession();
  const creds = { accessToken: session.accessToken, subdomain: session.subdomain };
  const data = useQuery({
    queryKey: ["teacher-workspace", session.subdomain, session.accessToken],
    queryFn: () => getTeacherWorkspace(creds),
    gcTime: 0,
    retry: false,
  });
  const [selected, setSelected] = useState("");
  if (data.isPending) return <p className="p-10">Chargement de votre espace enseignant…</p>;
  if (data.isError)
    return (
      <div className="p-10">
        <h1 className="text-2xl font-bold">Espace enseignant</h1>
        <p role="alert">
          {data.error instanceof ApiError ? data.error.message : "Impossible de charger votre espace."}
        </p>
      </div>
    );
  const id = selected || data.data.assignments[0]?.id;
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-10">
      <header className="rounded-2xl bg-slate-900 p-6 text-white">
        <p className="text-teal-300">Espace enseignant</p>
        <h1 className="mt-2 text-3xl font-bold">Bonjour {data.data.employee.firstName}</h1>
        <p className="mt-2 text-slate-300">Mes classes, mes présences et mes évaluations.</p>
      </header>
      <TeacherCourseNotifications />
      {!data.data.assignments.length ? (
        <p className="rounded border bg-amber-50 p-5">
          Aucune affectation pour l'année en cours. Demandez à l'établissement de renseigner vos classes et
          matières.
        </p>
      ) : (
        <>
          <label className="block font-semibold">
            Ma classe et ma matière
            <select
              value={id}
              onChange={(e) => setSelected(e.target.value)}
              className="ml-3 max-w-full rounded border p-2"
            >
              {data.data.assignments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.classroom.name} · {a.subject.nameFr} · {a.academicYear.name}
                </option>
              ))}
            </select>
          </label>
          <ClassroomWork key={id} id={id!} creds={creds} workspace={data.data} />
        </>
      )}
      <section className="rounded-xl border bg-white p-5">
        <h2 className="text-xl font-semibold">Devoirs à venir et annonces</h2>
        {data.data.summary.upcomingHomework.map((h) => (
          <p key={h.id} className="mt-2">
            {h.title} · {h.dueAt.slice(0, 10)}
          </p>
        ))}
        {data.data.summary.announcements.map((a) => (
          <article key={a.id} className="mt-3">
            <h3 className="font-semibold">{a.title}</h3>
            <p>{a.body}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
