import { Button } from "@edumanage/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { formText } from "../../lib/formData.js";
import {
  listGuardians,
  saveGuardian,
  uploadGuardianPhoto,
  type SchoolGuardian,
} from "../../lib/registrationApi.js";
import { useRequiredSession } from "../../lib/useSession.js";

export function GuardiansPage(): ReactNode {
  const session = useRequiredSession();
  const creds = { accessToken: session.accessToken, subdomain: session.subdomain };
  const client = useQueryClient();
  const [editing, setEditing] = useState<SchoolGuardian | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const photoUpload = useMutation({
    mutationFn: (file: File) => uploadGuardianPhoto(editing!.id, file, creds),
    onSuccess: (g) => {
      setEditing((prev) => (prev ? { ...prev, photoUrl: g.photoUrl ?? null } : null));
      setPhoto(null);
      void client.invalidateQueries({ queryKey: ["guardians"] });
      void client.invalidateQueries({ queryKey: ["parent-profile"] });
    },
  });
  const [search, setSearch] = useState("");
  const canWrite = session.roleCodes.some((role) =>
    ["SCHOOL_OWNER", "SCHOOL_ADMIN", "SECRETARY"].includes(role),
  );
  const guardians = useQuery({
    queryKey: ["guardians", session.subdomain],
    queryFn: () => listGuardians(creds),
  });
  const mutation = useMutation({
    mutationFn: (data: FormData) =>
      saveGuardian(
        {
          firstName: formText(data, "firstName"),
          lastName: formText(data, "lastName"),
          phone: formText(data, "phone"),
          ...(data.get("email") ? { email: formText(data, "email") } : {}),
          ...(data.get("address") ? { address: formText(data, "address") } : {}),
        },
        creds,
        editing?.id,
      ),
    onSuccess: () => {
      setEditing(null);
      void client.invalidateQueries({ queryKey: ["guardians", session.subdomain] });
    },
  });
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      <h1 className="text-2xl font-bold">Parents / tuteurs</h1>
      <p className="text-slate-600">
        Un seul tuteur principal par élève. Un même tuteur peut être responsable de plusieurs élèves. Ce
        dossier administratif ne donne aucun accès automatique au portail.
      </p>
      {canWrite && (
        <form
          key={editing?.id ?? `new-${mutation.submittedAt}`}
          className="space-y-3 rounded-lg border bg-white p-5"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate(new FormData(event.currentTarget));
          }}
        >
          <h2 className="font-semibold">{editing ? "Modifier le tuteur" : "Ajouter un parent / tuteur"}</h2>
          {editing?.centralGuardianId && (
            <p className="rounded bg-teal-50 p-3 text-sm text-teal-800">
              Profil central : les modifications et la photo sont synchronisées avec le portail parent et les
              établissements liés. L'email et le téléphone de connexion restent gérés par le parent.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              Prénom
              <input
                name="firstName"
                required
                maxLength={100}
                defaultValue={editing?.firstName}
                className="input w-full"
              />
            </label>
            <label>
              Nom
              <input
                name="lastName"
                required
                maxLength={100}
                defaultValue={editing?.lastName}
                className="input w-full"
              />
            </label>
            <label>
              Téléphone
              <input
                name="phone"
                type="tel"
                required
                minLength={3}
                defaultValue={editing?.phone}
                className="input w-full"
              />
            </label>
            <label>
              Email
              <input name="email" type="email" defaultValue={editing?.email ?? ""} className="input w-full" />
            </label>
            <label>
              Adresse
              <input name="address" defaultValue={editing?.address ?? ""} className="input w-full" />
            </label>
          </div>
          <Button type="submit" disabled={mutation.isPending}>
            Enregistrer
          </Button>
          {editing && (
            <button type="button" className="ml-3" onClick={() => setEditing(null)}>
              Annuler
            </button>
          )}
          {mutation.isError && (
            <p role="alert" className="text-red-600">
              {mutation.error.message}
            </p>
          )}
          {mutation.isSuccess && (
            <p role="status" className="text-teal-700">
              Tuteur enregistré.
            </p>
          )}
        </form>
      )}
      <label className="block">
        Rechercher un tuteur
        <input className="input ml-3" value={search} onChange={(event) => setSearch(event.target.value)} />
      </label>
      {guardians.isPending && <p>Chargement…</p>}
      {guardians.isError && <p role="alert">Impossible de charger les tuteurs.</p>}
      {guardians.data?.length === 0 && (
        <p>Aucun tuteur. Ajoutez d'abord un parent, puis rattachez ses enfants depuis leur fiche.</p>
      )}
      {editing && canWrite && (
        <section className="space-y-3 rounded-lg border bg-white p-5">
          <h2 className="font-semibold">Photo du parent / tuteur</h2>
          {editing.photoUrl && (
            <img
              src={editing.photoUrl}
              alt="Photo du profil parent"
              className="h-24 w-24 rounded-full object-cover"
            />
          )}
          <label className="block">
            Choisir une photo (JPEG ou PNG, 3 Mo maximum)
            <input
              type="file"
              accept="image/jpeg,image/png"
              className="mt-2 block"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            />
          </label>
          <Button
            type="button"
            disabled={!photo || photoUpload.isPending}
            onClick={() => photo && photoUpload.mutate(photo)}
          >
            Enregistrer la photo du parent
          </Button>
          {photoUpload.isError && (
            <p role="alert" className="text-red-700">
              Impossible d'enregistrer la photo. Vérifiez le format et les liens du parent.
            </p>
          )}
          {photoUpload.isSuccess && (
            <p role="status" className="text-teal-700">
              Photo enregistrée et synchronisée.
            </p>
          )}
        </section>
      )}
      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="p-3">Parent / tuteur</th>
              <th>Téléphone</th>
              <th>Email</th>
              <th>Élèves à charge</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {guardians.data
              ?.filter((g) =>
                `${g.firstName} ${g.lastName} ${g.phone}`.toLowerCase().includes(search.toLowerCase()),
              )
              .map((g) => (
                <tr key={g.id} className="border-t">
                  <td className="p-3">
                    {g.photoUrl && (
                      <img
                        src={g.photoUrl}
                        alt="Photo du parent / tuteur"
                        className="mr-2 inline-block h-10 w-10 rounded-full object-cover"
                      />
                    )}
                    {g.firstName} {g.lastName}
                  </td>
                  <td>{g.phone}</td>
                  <td>{g.email ?? "—"}</td>
                  <td>
                    {g.students.map((student) => (
                      <Link
                        key={student.id}
                        className="mr-3 text-teal-700 underline"
                        to={`/eleves/${student.id}`}
                      >
                        {student.firstName} {student.lastName}
                      </Link>
                    ))}
                  </td>
                  <td>
                    {canWrite && (
                      <button type="button" onClick={() => setEditing(g)}>
                        Modifier
                      </button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
