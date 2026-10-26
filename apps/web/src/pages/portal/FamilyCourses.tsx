import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { apiRequest, fetchBlob } from "../../lib/apiClient.js";
import type { CourseWithProgress, OnlineCourse } from "../../lib/elearningApi.js";

export function CoursePdfDownload({
  path,
  accessToken,
  subdomain,
  authContext = "portal",
}: {
  path: string;
  accessToken: string;
  subdomain?: string;
  authContext?: "portal" | "staff";
}) {
  const [url, setUrl] = useState("");
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  const download = useMutation({
    mutationFn: () => fetchBlob(path, { accessToken, authContext, ...(subdomain ? { subdomain } : {}) }),
    onSuccess: (blob) => setUrl(URL.createObjectURL(blob)),
  });
  return (
    <span>
      <button
        className="text-teal-700 underline"
        disabled={download.isPending}
        onClick={() => download.mutate()}
      >
        Préparer le PDF du cours
      </button>
      {url && (
        <a className="ml-3 text-teal-700 underline" href={url} download="cours.pdf">
          Télécharger le cours PDF
        </a>
      )}
      {download.isError && <span role="alert">Téléchargement impossible.</span>}
    </span>
  );
}
function ParentCourse({
  course,
  base,
  accessToken,
}: {
  course: OnlineCourse;
  base: string;
  accessToken: string;
}) {
  const [open, setOpen] = useState(false);
  const detail = useQuery({
    queryKey: ["parent-course", accessToken, base, course.id],
    queryFn: () =>
      apiRequest<CourseWithProgress>(`${base}/${course.id}`, { accessToken, authContext: "portal" }),
    enabled: open,
  });
  return (
    <li className="border-b py-3">
      <button className="font-medium text-teal-700" onClick={() => setOpen(!open)}>
        {course.title}
      </button>
      {open && detail.isError && <p role="alert">Cours indisponible.</p>}
      {open &&
        detail.data?.resources.map((r) => (
          <div className="my-2 rounded bg-slate-50 p-3" key={r.id}>
            <p>{r.title}</p>
            {r.content && <p className="whitespace-pre-line">{r.content}</p>}
            {r.url && (
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-teal-700 underline">
                Ouvrir la ressource gratuite
              </a>
            )}
            {r.fileKey && (
              <CoursePdfDownload
                path={`${base}/${course.id}/resources/${r.id}/file`}
                accessToken={accessToken}
              />
            )}
          </div>
        ))}
    </li>
  );
}
export function FamilyCourses({ studentId, accessToken }: { studentId: string; accessToken: string }) {
  const base = `/parent-portal/children/${studentId}/courses`;
  const data = useQuery({
    queryKey: ["parent-courses", accessToken, studentId],
    queryFn: () => apiRequest<OnlineCourse[]>(base, { accessToken, authContext: "portal" }),
  });
  return (
    <section className="rounded-lg border bg-white p-5">
      <h2 className="text-lg font-semibold">Cours et ressources pédagogiques gratuits</h2>
      <p className="text-sm text-slate-500">
        Cours validés par l'administration pour la classe de votre enfant.
      </p>
      {data.isError && <p role="alert">Impossible de charger les cours.</p>}
      {data.isSuccess && !data.data.length && <p>Aucun cours validé pour le moment.</p>}
      <ul>
        {data.data?.map((c) => (
          <ParentCourse key={c.id} course={c} base={base} accessToken={accessToken} />
        ))}
      </ul>
    </section>
  );
}
