import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { ApiError } from "../../lib/apiClient.js";
import { listAcademicYears, listClassrooms } from "../../lib/schoolConfigApi.js";
import { fetchClassIdCardsPdf } from "../../lib/studentsApi.js";
import { useRequiredSession } from "../../lib/useSession.js";

export function ClassIdCardsDownload() {
  const session = useRequiredSession();
  const creds = { accessToken: session.accessToken, subdomain: session.subdomain };
  const classrooms = useQuery({
    queryKey: ["classrooms", session.subdomain],
    queryFn: () => listClassrooms(creds),
  });
  const years = useQuery({
    queryKey: ["academic-years", session.subdomain],
    queryFn: () => listAcademicYears(creds),
  });
  const [classroomId, setClassroomId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<{ url: string; name: string } | null>(null);
  useEffect(
    () => () => {
      if (file) URL.revokeObjectURL(file.url);
    },
    [file],
  );
  async function download() {
    if (!classroomId) return;
    setLoading(true);
    setError(null);
    setFile(null);
    try {
      const url = URL.createObjectURL(await fetchClassIdCardsPdf(classroomId, creds));
      const name = `cartes-classe-${classroomId}.pdf`;
      setFile({ url, name });
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === "CLASSROOM_EMPTY"
          ? "Cette classe ne contient aucun élève inscrit actif."
          : "Le téléchargement des cartes a échoué. Réessayez.",
      );
    } finally {
      setLoading(false);
    }
  }
  const year = years.data?.find((y) => y.isCurrent);
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-slate-900">Cartes scolaires par classe</h2>
      <p className="mt-1 text-sm text-slate-600">
        Un PDF contenant une carte premium par élève inscrit pour l'année en cours.
      </p>
      {(classrooms.isError || years.isError) && <p role="alert">Impossible de charger les classes.</p>}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label htmlFor="id-card-class">Classe</label>
        <select
          id="id-card-class"
          className="rounded border border-slate-300 p-2"
          disabled={loading}
          value={classroomId}
          onChange={(e) => {
            setClassroomId(e.target.value);
            setFile(null);
            setError(null);
          }}
        >
          <option value="">Choisir une classe</option>
          {(classrooms.data ?? [])
            .filter((c) => c.academicYearId === year?.id)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {year?.name}
              </option>
            ))}
        </select>
        <button
          type="button"
          className="rounded bg-teal-600 px-3 py-2 text-sm text-white disabled:opacity-50"
          disabled={!classroomId || loading}
          onClick={() => void download()}
        >
          {loading ? "Préparation des cartes…" : "Télécharger les cartes de la classe"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {file && (
        <a className="mt-2 block text-sm text-teal-700 underline" href={file.url} download={file.name}>
          Télécharger le PDF des cartes
        </a>
      )}
    </section>
  );
}
