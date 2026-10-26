import { Button } from "@edumanage/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { formText } from "../../lib/formData.js";
import {
  createRegistrationPeriod,
  listRegistrationPeriods,
  listRegistrations,
  setRegistrationPeriodOpen,
} from "../../lib/registrationApi.js";
import { listAcademicYears, listClassrooms } from "../../lib/schoolConfigApi.js";
import { enrollStudent, listStudents } from "../../lib/studentsApi.js";
import { useRequiredSession } from "../../lib/useSession.js";

export function RegistrationsPage(): ReactNode {
  const session = useRequiredSession();
  const creds = { accessToken: session.accessToken, subdomain: session.subdomain };
  const client = useQueryClient();
  const [yearId, setYearId] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [classroomId, setClassroomId] = useState("");
  const [trancheCount, setTrancheCount] = useState(1);
  const canWrite = session.roleCodes.some((role) =>
    ["SCHOOL_OWNER", "SCHOOL_ADMIN", "SECRETARY"].includes(role),
  );
  const years = useQuery({
    queryKey: ["academic-years", session.subdomain],
    queryFn: () => listAcademicYears(creds),
  });
  const periods = useQuery({
    queryKey: ["registration-periods", session.subdomain],
    queryFn: () => listRegistrationPeriods(creds),
  });
  const classrooms = useQuery({
    queryKey: ["classrooms", session.subdomain],
    queryFn: () => listClassrooms(creds),
  });
  const students = useQuery({
    queryKey: ["students", session.subdomain, "registration"],
    queryFn: () => listStudents(creds),
  });
  const registrations = useQuery({
    queryKey: ["registrations", session.subdomain, yearId],
    queryFn: () => listRegistrations(creds, yearId),
  });
  const refresh = (): void => {
    void client.invalidateQueries({ queryKey: ["registration-periods", session.subdomain] });
    void client.invalidateQueries({ queryKey: ["registrations", session.subdomain] });
    void client.invalidateQueries({ queryKey: ["students", session.subdomain] });
  };
  const createPeriod = useMutation({
    mutationFn: (data: FormData) =>
      createRegistrationPeriod(
        {
          name: formText(data, "name"),
          academicYearId: yearId,
          startDate: new Date(`${formText(data, "startDate")}T00:00:00Z`).toISOString(),
          endDate: new Date(`${formText(data, "endDate")}T23:59:59.999Z`).toISOString(),
          installments: Array.from({ length: trancheCount }, (_, index) => ({
            amountCents: Math.round(Number(data.get(`amount-${index}`)) * 100),
            dueDate: new Date(`${formText(data, `due-${index}`)}T23:59:59.999Z`).toISOString(),
          })),
        },
        creds,
      ),
    onSuccess: refresh,
  });
  const togglePeriod = useMutation({
    mutationFn: ({ id, isOpen }: { id: string; isOpen: boolean }) =>
      setRegistrationPeriodOpen(id, isOpen, creds),
    onSuccess: refresh,
  });
  const enroll = useMutation({
    mutationFn: () => {
      const classroom = classrooms.data?.find((item) => item.id === classroomId);
      if (!classroom) throw new Error("Sélectionnez une classe");
      return enrollStudent(
        studentId,
        {
          academicYearId: classroom.academicYearId,
          classroomId,
          campusId: classroom.campusId,
          gradeLevelId: classroom.gradeLevelId,
          registrationPeriodId: periodId,
        },
        creds,
      );
    },
    onSuccess: () => {
      refresh();
      setStudentId("");
      void client.invalidateQueries({ queryKey: ["student-invoices", session.subdomain] });
    },
  });
  const period = periods.data?.find((item) => item.id === periodId);
  const student = students.data?.find((item) => item.id === studentId);
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      <h1 className="text-2xl font-bold">Inscriptions / réinscriptions</h1>
      <p className="text-slate-600">
        Choisissez l'année, ouvrez une période et définissez une à trois tranches de frais d'inscription.
        Chaque inscription génère les factures correspondantes, consultables dans la fiche élève.
      </p>
      <label className="block font-medium">
        Année académique
        <select
          className="input ml-3"
          value={yearId}
          onChange={(event) => {
            setYearId(event.target.value);
            setPeriodId("");
            setClassroomId("");
          }}
        >
          <option value="">Toutes les années</option>
          {years.data?.map((year) => (
            <option key={year.id} value={year.id}>
              {year.name}
            </option>
          ))}
        </select>
      </label>
      {years.data?.length === 0 && (
        <p>
          Créez d'abord une année académique et ses classes dans{" "}
          <Link className="underline" to="/configuration">
            Configuration
          </Link>
          .
        </p>
      )}
      {canWrite && yearId && (
        <form
          className="space-y-3 rounded-lg border bg-white p-5"
          onSubmit={(event) => {
            event.preventDefault();
            createPeriod.mutate(new FormData(event.currentTarget));
          }}
        >
          <h2 className="font-semibold">Nouvelle période d'inscription</h2>
          <div className="flex flex-wrap gap-3">
            <label>
              Libellé
              <input className="input block" name="name" required maxLength={100} />
            </label>
            <label>
              Ouverture
              <input className="input block" type="date" name="startDate" required />
            </label>
            <label>
              Clôture
              <input className="input block" type="date" name="endDate" required />
            </label>
            <label>
              Nombre de tranches
              <select
                className="input block"
                value={trancheCount}
                onChange={(event) => setTrancheCount(Number(event.target.value))}
              >
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {Array.from({ length: trancheCount }, (_, index) => (
            <div key={index} className="flex flex-wrap gap-3">
              <label>
                Tranche {index + 1} — montant (devise de l'établissement)
                <input
                  className="input block"
                  name={`amount-${index}`}
                  type="number"
                  required
                  min="0.01"
                  step="0.01"
                />
              </label>
              <label>
                Échéance
                <input className="input block" name={`due-${index}`} type="date" required />
              </label>
            </div>
          ))}
          <Button type="submit" disabled={createPeriod.isPending}>
            Créer la période
          </Button>
          {createPeriod.isError && (
            <p role="alert" className="text-red-600">
              {createPeriod.error.message}
            </p>
          )}
          {createPeriod.isSuccess && <p role="status">Période créée.</p>}
        </form>
      )}
      <section className="rounded-lg border bg-white p-5">
        <h2 className="font-semibold">Périodes et frais d'inscription</h2>
        {periods.data
          ?.filter((p) => !yearId || p.academicYearId === yearId)
          .map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-3">
              <div>
                <strong>{p.name}</strong> · {p.academicYear.name} · {p.startDate.slice(0, 10)} →{" "}
                {p.endDate.slice(0, 10)}
                <p>
                  {p.installments.length} tranche(s) · total{" "}
                  {(p.installments.reduce((sum, i) => sum + i.amountCents, 0) / 100).toLocaleString("fr-FR")}{" "}
                  · {p.isOpen ? "Ouverte" : "Fermée"}
                </p>
                <ol className="mt-2 text-sm text-slate-600">
                  {p.installments.map((item, index) => (
                    <li key={index}>
                      Tranche {index + 1} : {(item.amountCents / 100).toLocaleString("fr-FR")} · échéance{" "}
                      {item.dueDate.slice(0, 10)}
                    </li>
                  ))}
                </ol>
              </div>
              {canWrite && (
                <button
                  type="button"
                  disabled={togglePeriod.isPending}
                  onClick={() => togglePeriod.mutate({ id: p.id, isOpen: !p.isOpen })}
                >
                  {p.isOpen ? "Fermer" : "Rouvrir"}
                </button>
              )}
            </div>
          ))}
        {togglePeriod.isError && <p role="alert">{togglePeriod.error.message}</p>}
        {periods.data?.length === 0 && <p>Aucune période définie.</p>}
      </section>
      {canWrite && (
        <form
          className="space-y-3 rounded-lg border bg-white p-5"
          onSubmit={(event) => {
            event.preventDefault();
            enroll.mutate();
          }}
        >
          <h2 className="font-semibold">Inscrire un élève</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <label>
              Période
              <select
                className="input w-full"
                required
                value={periodId}
                onChange={(event) => {
                  setPeriodId(event.target.value);
                  setClassroomId("");
                }}
              >
                <option value="">Choisir une période</option>
                {periods.data
                  ?.filter(
                    (p) =>
                      (!yearId || p.academicYearId === yearId) &&
                      p.isOpen &&
                      new Date(p.startDate) <= new Date() &&
                      new Date(p.endDate) >= new Date(),
                  )
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.academicYear.name})
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Élève
              <select
                className="input w-full"
                required
                value={studentId}
                onChange={(event) => setStudentId(event.target.value)}
              >
                <option value="">Choisir un élève</option>
                {students.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.matricule} — {s.firstName} {s.lastName}
                    {!s.primaryGuardianId ? " (tuteur manquant)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Classe
              <select
                className="input w-full"
                required
                value={classroomId}
                onChange={(event) => setClassroomId(event.target.value)}
              >
                <option value="">Choisir une classe</option>
                {classrooms.data
                  ?.filter((c) => c.academicYearId === period?.academicYearId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          {student && !student.primaryGuardianId && (
            <p className="text-amber-700">
              Renseignez le tuteur dans{" "}
              <Link className="underline" to={`/eleves/${student.id}`}>
                la fiche élève
              </Link>{" "}
              avant l'inscription.
            </p>
          )}
          {period && (
            <p className="text-sm text-slate-600">
              Frais d'inscription :{" "}
              {(period.installments.reduce((sum, item) => sum + item.amountCents, 0) / 100).toLocaleString(
                "fr-FR",
              )}{" "}
              en {period.installments.length} tranche(s). Les factures seront créées à la confirmation.
            </p>
          )}
          <Button
            type="submit"
            disabled={!periodId || !student?.primaryGuardianId || !classroomId || enroll.isPending}
          >
            Confirmer l'inscription et créer les échéances
          </Button>
          {enroll.isError && (
            <p role="alert" className="text-red-600">
              {enroll.error.message}
            </p>
          )}
          {enroll.isSuccess && (
            <p role="status" className="text-teal-700">
              Inscription enregistrée et factures créées.
            </p>
          )}
        </form>
      )}
      {[years, periods, classrooms, students, registrations].some((q) => q.isError) && (
        <p role="alert">Impossible de charger certaines données. Réessayez.</p>
      )}
      <section className="overflow-x-auto rounded-lg border bg-white p-5">
        <h2 className="mb-3 font-semibold">Inscriptions enregistrées</h2>
        {registrations.isPending && <p>Chargement…</p>}
        {registrations.data?.length === 0 && <p>Aucune inscription pour cette sélection.</p>}
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th>Élève</th>
              <th>Tuteur principal</th>
              <th>Année</th>
              <th>Classe</th>
              <th>Période</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {registrations.data?.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="py-3">
                  <Link className="text-teal-700 underline" to={`/eleves/${r.student.id}`}>
                    {r.student.firstName} {r.student.lastName}
                  </Link>
                </td>
                <td>
                  {r.student.primaryGuardian
                    ? `${r.student.primaryGuardian.firstName} ${r.student.primaryGuardian.lastName}`
                    : "À compléter"}
                </td>
                <td>{r.academicYear.name}</td>
                <td>{r.classroom.name}</td>
                <td>{r.registrationPeriod?.name ?? "Dossier historique à compléter"}</td>
                <td>{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
