import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { listLinkedStudents } from "../../lib/familyApi.js";
import { loadPortalSession } from "../../lib/portalSession.js";
import {
  getStudentProfile,
  updateMyStudentProfile,
  uploadMyStudentPhoto,
  type StudentContactInput,
} from "../../lib/studentPortalApi.js";

const fields = [
  ["address", "Adresse"],
  ["phone", "Téléphone"],
  ["birthPlace", "Lieu de naissance"],
  ["nationality", "Nationalité"],
  ["emergencyContactName", "Contact d'urgence"],
  ["emergencyContactPhone", "Téléphone d'urgence"],
] as const;
function ProfileForm({ studentId }: { studentId: string }) {
  const token = loadPortalSession()!.accessToken;
  const client = useQueryClient();
  const profile = useQuery({
    queryKey: ["my-student-profile", studentId, token],
    queryFn: () => getStudentProfile(studentId, token),
    gcTime: 0,
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState("");
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["my-student-profile", studentId, token] });
    void client.invalidateQueries({ queryKey: ["student-dashboard", studentId] });
  };
  const save = useMutation({
    mutationFn: (data: StudentContactInput) => updateMyStudentProfile(studentId, data, token),
    onSuccess: refresh,
  });
  const upload = useMutation({
    mutationFn: (file: File) => uploadMyStudentPhoto(studentId, file, token),
    onSuccess: () => {
      setPhoto(null);
      refresh();
    },
  });
  if (profile.isPending) return <p>Chargement du profil…</p>;
  if (profile.isError)
    return <p role="alert">Impossible de charger ce profil. Vérifiez votre abonnement et votre connexion.</p>;
  const s = profile.data.student;
  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">
          {s.firstName} {s.lastName}
        </h2>
        <p className="text-sm text-slate-600">
          Matricule : {s.matricule} · {profile.data.currentEnrollment?.classroomName} ·{" "}
          {profile.data.currentEnrollment?.academicYearName}
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Date de naissance :{" "}
          {s.dateOfBirth
            ? new Date(s.dateOfBirth).toLocaleDateString("fr-FR", { timeZone: "UTC" })
            : "Non renseignée"}{" "}
          · Sexe : {s.gender ?? "Non renseigné"}
        </p>
        <p className="mt-2 text-sm text-slate-500">
          L'identité et l'inscription sont gérées par votre établissement. Votre photo et vos coordonnées
          seront reprises sur votre carte scolaire recto verso.
        </p>
      </section>
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="font-semibold">Photo d'identité</h2>
        {s.photoUrl && (
          <img
            src={s.photoUrl}
            alt="Photo d'identité de l'élève"
            className="my-3 h-32 w-24 rounded object-cover"
          />
        )}
        <label className="mt-3 block">
          Choisir une photo (JPEG ou PNG, 3 Mo maximum)
          <input
            type="file"
            accept="image/png,image/jpeg"
            className="mt-2 block"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setPhotoError("");
              if (f && (!["image/png", "image/jpeg"].includes(f.type) || f.size > 3 * 1024 * 1024)) {
                setPhoto(null);
                setPhotoError("Choisissez une image JPEG ou PNG de moins de 3 Mo.");
              } else setPhoto(f);
            }}
          />
        </label>
        <button
          type="button"
          className="mt-3 rounded bg-teal-600 px-4 py-2 text-white disabled:opacity-50"
          disabled={!photo || upload.isPending}
          onClick={() => photo && upload.mutate(photo)}
        >
          {upload.isPending ? "Envoi…" : "Enregistrer la photo"}
        </button>
        {(photoError || upload.isError) && (
          <p role="alert" className="text-red-700">
            {photoError || "Impossible d'enregistrer la photo."}
          </p>
        )}
        {upload.isSuccess && (
          <p role="status">Photo enregistrée. Elle figurera sur la prochaine carte téléchargée.</p>
        )}
      </section>
      <form
        key={JSON.stringify(s)}
        className="grid gap-4 rounded-xl border bg-white p-6 shadow-sm sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          const data = Object.fromEntries(
            fields.map(([key]) => [
              key,
              (typeof form.get(key) === "string" ? (form.get(key) as string).trim() : "") || null,
            ]),
          ) as StudentContactInput;
          save.mutate(data);
        }}
      >
        {fields.map(([key, label]) => (
          <label key={key} className="block text-sm font-medium">
            {label}
            <input
              name={key}
              type={key.toLowerCase().includes("phone") ? "tel" : "text"}
              maxLength={
                key === "address"
                  ? 240
                  : key === "nationality"
                    ? 80
                    : key.toLowerCase().includes("phone")
                      ? 40
                      : 120
              }
              defaultValue={s[key] ?? ""}
              className="mt-1 w-full rounded border p-2"
            />
          </label>
        ))}
        <button
          className="rounded bg-teal-600 px-4 py-2 text-white disabled:opacity-50"
          disabled={save.isPending}
        >
          {save.isPending ? "Enregistrement…" : "Enregistrer mes coordonnées"}
        </button>
        {save.isError && (
          <p role="alert" className="text-red-700">
            Impossible d'enregistrer les coordonnées.
          </p>
        )}
        {save.isSuccess && <p role="status">Coordonnées enregistrées et carte scolaire mise à jour.</p>}
      </form>
    </div>
  );
}
export function StudentProfilePage() {
  const token = loadPortalSession()!.accessToken;
  const links = useQuery({ queryKey: ["linked-students", token], queryFn: () => listLinkedStudents(token) });
  const [selected, setSelected] = useState("");
  const id = selected || links.data?.[0]?.student.id;
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-10">
      <h1 className="text-3xl font-bold text-slate-900">Mon profil élève</h1>
      {links.isPending ? (
        <p>Chargement…</p>
      ) : links.isError ? (
        <p role="alert">Impossible de charger vos dossiers.</p>
      ) : !id ? (
        <p>Aucun dossier élève lié.</p>
      ) : (
        <>
          {(links.data?.length ?? 0) > 1 && (
            <label>
              Établissement / dossier
              <select
                className="ml-3 rounded border p-2"
                value={id}
                onChange={(e) => setSelected(e.target.value)}
              >
                {links.data?.map((l) => (
                  <option key={l.student.id} value={l.student.id}>
                    {l.student.firstName} {l.student.lastName} · {l.student.matricule}
                  </option>
                ))}
              </select>
            </label>
          )}
          <ProfileForm key={id} studentId={id} />
        </>
      )}
    </div>
  );
}
