import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest, ApiError, type TenantCredentials } from "../../lib/apiClient.js";
import type { Employee } from "../../lib/employeesApi.js";
import { formText } from "../../lib/formData.js";
import { listSubjects, listClassrooms, listAcademicYears } from "../../lib/schoolConfigApi.js";
import { useRequiredSession } from "../../lib/useSession.js";

interface Assignment {
  id: string;
  classroomId: string;
  subjectId: string;
}
export function EmployeeTeachingSetup({ employee, creds }: { employee: Employee; creds: TenantCredentials }) {
  const session = useRequiredSession();
  const client = useQueryClient();
  const subjects = useQuery({ queryKey: ["subjects", creds.subdomain], queryFn: () => listSubjects(creds) });
  const classrooms = useQuery({
    queryKey: ["classrooms", creds.subdomain],
    queryFn: () => listClassrooms(creds),
  });
  const years = useQuery({
    queryKey: ["academic-years", creds.subdomain],
    queryFn: () => listAcademicYears(creds),
  });
  const assignments = useQuery({
    queryKey: ["employee-assignments", employee.id],
    queryFn: () =>
      apiRequest<Assignment[]>(
        `/school-config/teacher-assignments?employeeId=${encodeURIComponent(employee.id)}`,
        creds,
      ),
  });
  const link = useMutation({
    mutationFn: (form: FormData) =>
      apiRequest(`/employees/${employee.id}/teacher-account`, {
        ...creds,
        method: "POST",
        body: { email: formText(form, "teacherEmail") },
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["employee", employee.id] });
    },
  });
  const create = useMutation({
    mutationFn: (form: FormData) => {
      const classroom = classrooms.data?.find((c) => c.id === formText(form, "classroomId"));
      return apiRequest("/school-config/teacher-assignments", {
        ...creds,
        method: "POST",
        body: {
          employeeId: employee.id,
          subjectId: formText(form, "subjectId"),
          classroomId: classroom?.id,
          academicYearId: classroom?.academicYearId,
        },
      });
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["employee-assignments", employee.id] });
      void client.invalidateQueries({ queryKey: ["teacher-workspace"] });
    },
  });
  const year = years.data?.find((y) => y.isCurrent);
  return (
    <div className="mt-5 space-y-4 border-t pt-4">
      <h3 className="font-semibold">Accès au dashboard enseignant</h3>
      <p className="text-sm text-slate-600">
        {employee.userId ? "Un compte est lié à cette fiche." : "Aucun compte de connexion lié."} Le compte
        doit posséder le rôle Enseignant dans{" "}
        <span>l’espace Utilisateurs du superadministrateur</span>
        .
      </p>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          link.mutate(new FormData(e.currentTarget));
        }}
      >
        <label>
          Email du compte enseignant
          <input
            name="teacherEmail"
            type="email"
            required
            defaultValue={employee.email ?? ""}
            className="mt-1 block rounded border p-2"
          />
        </label>
        <button disabled={link.isPending} className="rounded bg-slate-900 px-3 py-2 text-white">
          Lier ce compte enseignant
        </button>
      </form>
      {link.isError && (
        <p role="alert">{link.error instanceof ApiError ? link.error.message : "Liaison impossible."}</p>
      )}
      {link.isSuccess && <p role="status">Compte enseignant lié.</p>}
      <h3 className="font-semibold">Affectations pédagogiques</h3>
      {assignments.isError && <p role="alert">Impossible de charger les affectations.</p>}
      {(assignments.data ?? []).map((a) => (
        <p key={a.id}>
          {classrooms.data?.find((c) => c.id === a.classroomId)?.name ?? "Classe"} ·{" "}
          {subjects.data?.find((s) => s.id === a.subjectId)?.nameFr ?? "Matière"}
        </p>
      ))}
      {session.roleCodes.some((r) => ["SCHOOL_OWNER", "SCHOOL_ADMIN"].includes(r)) && (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(new FormData(e.currentTarget));
          }}
        >
          <label>
            Classe enseignée
            <select name="classroomId" required className="mt-1 block rounded border p-2">
              <option value="">Choisir une classe</option>
              {(classrooms.data ?? [])
                .filter((c) => c.academicYearId === year?.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {year?.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Matière enseignée
            <select
              name="subjectId"
              required
              defaultValue={employee.subjectId ?? ""}
              className="mt-1 block rounded border p-2"
            >
              <option value="">Choisir une matière</option>
              {(subjects.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nameFr}
                </option>
              ))}
            </select>
          </label>
          <button disabled={create.isPending} className="rounded bg-teal-600 px-3 py-2 text-white">
            Ajouter l'affectation
          </button>
        </form>
      )}
      {create.isError && (
        <p role="alert">
          {create.error instanceof ApiError ? create.error.message : "Affectation impossible."}
        </p>
      )}
      {create.isSuccess && <p role="status">Affectation enregistrée.</p>}
    </div>
  );
}
