import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ApiError, type TenantCredentials } from "../../lib/apiClient.js";
import {
  updateStudentProfile,
  uploadStudentPhoto,
  type Student,
  type UpdateStudentProfileInput,
} from "../../lib/studentsApi.js";

const fields = [
  ["matricule", "Matricule", 80],
  ["firstName", "Prénom", 100],
  ["lastName", "Nom", 100],
  ["gender", "Sexe", 40],
  ["address", "Adresse", 240],
  ["phone", "Téléphone", 40],
  ["birthPlace", "Lieu de naissance", 120],
  ["nationality", "Nationalité", 80],
  ["emergencyContactName", "Contact d'urgence", 120],
  ["emergencyContactPhone", "Téléphone d'urgence", 40],
] as const;
export function StudentProfileEditor({ student, creds }: { student: Student; creds: TenantCredentials }) {
  const client = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  function refresh() {
    void client.invalidateQueries({ queryKey: ["student", student.id] });
    void client.invalidateQueries({ queryKey: ["students", creds.subdomain] });
    void client.invalidateQueries({ queryKey: ["my-student-profile", student.id] });
    void client.invalidateQueries({ queryKey: ["student-dashboard", student.id] });
  }
  const save = useMutation({
    mutationFn: (data: UpdateStudentProfileInput) => updateStudentProfile(student.id, data, creds),
    onSuccess: (data) => {
      client.setQueryData(["student", student.id], data);
      refresh();
    },
  });
  const upload = useMutation({
    mutationFn: (photo: File) => uploadStudentPhoto(student.id, photo, creds),
    onSuccess: () => {
      setFile(null);
      refresh();
    },
  });
  return (
    <section className="space-y-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Profil complet de l'élève</h2>
      <p className="text-sm text-slate-600">
        Les changements sont repris dans son portail et lors du prochain téléchargement de sa carte scolaire.
      </p>
      <form
        key={JSON.stringify(student)}
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          const data = Object.fromEntries(
            fields.map(([key]) => {
              const value = form.get(key);
              return [key, typeof value === "string" ? value.trim() || null : null];
            }),
          ) as Omit<UpdateStudentProfileInput, "dateOfBirth">;
          const dob = form.get("dateOfBirth");
          save.mutate({ ...data, dateOfBirth: typeof dob === "string" && dob ? dob : null });
        }}
      >
        {fields.map(([key, label, max]) => (
          <label key={key} className="block text-sm font-medium text-slate-700">
            {label}
            <input
              name={key}
              maxLength={max}
              required={["matricule", "firstName", "lastName"].includes(key)}
              type={key.toLowerCase().includes("phone") ? "tel" : "text"}
              defaultValue={student[key] ?? ""}
              className="mt-1 w-full rounded border border-slate-300 p-2"
            />
          </label>
        ))}
        <label className="block text-sm font-medium text-slate-700">
          Date de naissance
          <input
            type="date"
            name="dateOfBirth"
            defaultValue={student.dateOfBirth?.slice(0, 10) ?? ""}
            max={new Date().toISOString().slice(0, 10)}
            className="mt-1 w-full rounded border border-slate-300 p-2"
          />
        </label>
        <div className="self-end">
          <button
            className="rounded bg-teal-600 px-4 py-2 text-white disabled:opacity-50"
            disabled={save.isPending}
          >
            {save.isPending ? "Enregistrement…" : "Enregistrer le profil"}
          </button>
        </div>
      </form>
      {save.isError && (
        <p role="alert" className="text-sm text-red-700">
          {save.error instanceof ApiError && save.error.code === "MATRICULE_TAKEN"
            ? "Ce matricule est déjà utilisé dans l'établissement."
            : "Impossible d'enregistrer le profil. Vérifiez les champs et vos droits."}
        </p>
      )}
      {save.isSuccess && (
        <p role="status" className="text-sm text-teal-700">
          Profil enregistré. Le portail élève et la carte scolaire utilisent ces informations.
        </p>
      )}
      <div className="space-y-3 border-t pt-4">
        <h3 className="font-semibold">Photo d'identité</h3>
        {student.photoUrl && (
          <img
            src={student.photoUrl}
            alt="Photo d'identité actuelle"
            className="h-32 w-24 rounded border object-cover"
          />
        )}
        <label className="block text-sm">
          Choisir une photo d'identité (JPEG ou PNG, 3 Mo maximum)
          <input
            type="file"
            accept="image/jpeg,image/png"
            className="mt-2 block"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setPhotoError(null);
              if (f && (!["image/jpeg", "image/png"].includes(f.type) || f.size > 3 * 1024 * 1024)) {
                setFile(null);
                setPhotoError("Choisissez une image JPEG ou PNG de moins de 3 Mo.");
              } else setFile(f);
            }}
          />
        </label>
        <button
          type="button"
          className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
          disabled={!file || upload.isPending}
          onClick={() => file && upload.mutate(file)}
        >
          {upload.isPending ? "Téléversement…" : "Enregistrer la photo d'identité"}
        </button>
        {(photoError || upload.isError) && (
          <p role="alert" className="text-sm text-red-700">
            {photoError ?? "Impossible d'enregistrer la photo. Vérifiez le format et vos droits."}
          </p>
        )}
        {upload.isSuccess && (
          <p role="status" className="text-sm text-teal-700">
            Photo enregistrée. Elle est disponible dans le portail élève et sur sa carte scolaire.
          </p>
        )}
      </div>
    </section>
  );
}
