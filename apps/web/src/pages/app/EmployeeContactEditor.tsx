import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { TenantCredentials } from "../../lib/apiClient.js";
import { updateEmployeeContact, type Employee } from "../../lib/employeesApi.js";
import { formText } from "../../lib/formData.js";
import { listSubjects } from "../../lib/schoolConfigApi.js";

import { EmployeeTeachingSetup } from "./EmployeeTeachingSetup.js";

export function EmployeeContactEditor({ employee, creds }: { employee: Employee; creds: TenantCredentials }) {
  const client = useQueryClient();
  const subjects = useQuery({ queryKey: ["subjects", creds.subdomain], queryFn: () => listSubjects(creds) });
  const save = useMutation({
    mutationFn: (form: FormData) =>
      updateEmployeeContact(
        employee.id,
        { email: formText(form, "email") || null, subjectId: formText(form, "subjectId") || null },
        creds,
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["employee", employee.id] });
      void client.invalidateQueries({ queryKey: ["employees", creds.subdomain] });
    },
  });
  return (
    <section className="rounded-lg border bg-white p-5">
      <h2 className="font-semibold">Email et matière</h2>
      <form
        key={employee.email + String(employee.subjectId)}
        className="mt-3 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(new FormData(e.currentTarget));
        }}
      >
        <label>
          Adresse email
          <input
            name="email"
            type="email"
            defaultValue={employee.email ?? ""}
            className="mt-1 block rounded border p-2"
          />
        </label>
        <label>
          Matière
          <select
            name="subjectId"
            defaultValue={employee.subjectId ?? ""}
            className="mt-1 block rounded border p-2"
          >
            <option value="">Aucune / personnel non enseignant</option>
            {(subjects.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.nameFr}
              </option>
            ))}
          </select>
        </label>
        <button disabled={save.isPending} className="rounded bg-teal-600 px-4 py-2 text-white">
          Enregistrer email et matière
        </button>
      </form>
      <p className="mt-2 text-sm text-slate-600">
        Les classes enseignées sont définies dans les affectations pédagogiques. L'accès au dashboard
        nécessite un compte enseignant lié à cette fiche.
      </p>
      {save.isError && <p role="alert">Impossible d'enregistrer ces informations.</p>}
      {save.isSuccess && <p role="status">Email et matière enregistrés.</p>}
      <EmployeeTeachingSetup employee={employee} creds={creds} />
    </section>
  );
}
