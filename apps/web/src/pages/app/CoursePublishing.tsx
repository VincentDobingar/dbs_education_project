import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { apiRequest, apiUpload, type TenantCredentials } from "../../lib/apiClient.js";
import type { OnlineCourse } from "../../lib/elearningApi.js";
import { useRequiredSession } from "../../lib/useSession.js";

export function CoursePublishing({ course, creds }: { course: OnlineCourse; creds: TenantCredentials }) {
  const session = useRequiredSession();
  const client = useQueryClient();
  const canWrite = session.roleCodes.some((r) =>
    ["SCHOOL_OWNER", "ACADEMIC_DIRECTOR", "TEACHER"].includes(r),
  );
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [reasonError, setReasonError] = useState(false);
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["elearning-courses"] });
    void client.invalidateQueries({ queryKey: ["elearning-resources", course.id] });
  };
  const upload = useMutation({
    mutationFn: () => apiUpload(`/elearning/courses/${course.id}/pdf`, "file", file!, creds, { title }),
    onSuccess: () => {
      setFile(null);
      setTitle("");
      refresh();
    },
  });
  const review = useMutation({
    mutationFn: (status: string) =>
      apiRequest(`/elearning/courses/${course.id}/review`, {
        ...creds,
        method: "POST",
        body: { status, ...(comment.trim() ? { comment: comment.trim() } : {}) },
      }),
    onSuccess: () => {
      setComment("");
      setReasonError(false);
      refresh();
    },
  });
  return (
    <section className="rounded-lg border bg-teal-50 p-4 space-y-3">
      <h3 className="font-semibold">Publication et validation du cours</h3>
      <p>
        Statut :{" "}
        {course.approvalStatus === "APPROVED"
          ? "Validé — visible des familles"
          : course.approvalStatus === "REJECTED"
            ? "Refusé — à corriger"
            : "En attente de validation administrative"}
      </p>
      <p className="text-sm">
        Toute modification du cours ou de ses ressources nécessite une nouvelle validation. Les ressources
        sont gratuites, sans achat de cours supplémentaire.
      </p>
      {course.reviewComment && <p>{course.reviewComment}</p>}
      {canWrite && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            upload.mutate();
          }}
          className="flex flex-wrap gap-3 items-end"
        >
          <label>
            Titre du PDF
            <input
              className="input block"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={200}
            />
          </label>
          <label>
            Fichier PDF (10 Mo maximum)
            <input
              className="block"
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <button
            className="rounded bg-teal-700 p-2 text-white"
            disabled={!file || !title || upload.isPending}
          >
            Charger le PDF
          </button>
        </form>
      )}
      {upload.isError && (
        <p role="alert">Téléversement impossible. Vérifiez le format PDF et la taille de 10 Mo maximum.</p>
      )}
      {upload.isSuccess && <p role="status">PDF chargé. Le cours attend sa validation.</p>}
      {session.roleCodes.some((r) =>
        ["SCHOOL_OWNER", "SCHOOL_ADMIN", "DIRECTOR", "ACADEMIC_DIRECTOR"].includes(r),
      ) && (
        <div className="space-y-3">
          <label className="block">
            Motif du refus (obligatoire pour refuser)
            <textarea
              className="input mt-1 block w-full"
              value={comment}
              maxLength={1000}
              disabled={review.isPending}
              onChange={(e) => {
                setComment(e.target.value);
                setReasonError(false);
              }}
            />
          </label>
          {reasonError && (
            <p role="alert" className="text-red-700">
              Saisissez un motif avant de refuser ce cours.
            </p>
          )}
          <div className="flex gap-3">
            <button
              disabled={review.isPending}
              className="rounded bg-teal-700 p-2 text-white"
              onClick={() => {
                setReasonError(false);
                review.mutate("APPROVED");
              }}
            >
              Valider et rendre visible aux familles
            </button>
            <button
              disabled={review.isPending}
              className="rounded border p-2"
              onClick={() => {
                if (!comment.trim()) {
                  setReasonError(true);
                  return;
                }
                setReasonError(false);
                review.mutate("REJECTED");
              }}
            >
              Refuser le cours
            </button>
          </div>
        </div>
      )}
      {review.isError && <p role="alert">Validation impossible.</p>}
      {review.isSuccess && <p role="status">Décision enregistrée.</p>}
    </section>
  );
}
