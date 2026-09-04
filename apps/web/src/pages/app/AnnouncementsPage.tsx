import { Button } from "@edumanage/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import {
  createAnnouncement,
  listAnnouncements,
  removeAnnouncement,
  type AnnouncementAudience,
} from "../../lib/communicationApi.js";
import { listClassrooms } from "../../lib/schoolConfigApi.js";
import { useRequiredSession } from "../../lib/useSession.js";

const AUDIENCES: AnnouncementAudience[] = ["ALL", "STAFF", "TEACHERS", "PARENTS", "STUDENTS", "CLASSROOM"];

const announcementSchema = z
  .object({
    title: z.string().min(1),
    body: z.string().min(1),
    audienceScope: z.enum(["ALL", "STAFF", "TEACHERS", "PARENTS", "STUDENTS", "CLASSROOM"]),
    classroomId: z.string().optional(),
  })
  .refine((data) => data.audienceScope !== "CLASSROOM" || data.classroomId, {
    message: "classroomId is required when audienceScope is CLASSROOM",
    path: ["classroomId"],
  });

export function AnnouncementsPage(): ReactNode {
  const { t } = useTranslation("app");
  const session = useRequiredSession();
  const creds = { accessToken: session.accessToken, subdomain: session.subdomain };
  const queryClient = useQueryClient();

  const announcements = useQuery({
    queryKey: ["announcements", session.subdomain],
    queryFn: () => listAnnouncements(creds),
  });
  const classrooms = useQuery({
    queryKey: ["classrooms", session.subdomain],
    queryFn: () => listClassrooms(creds),
  });

  const form = useForm<z.infer<typeof announcementSchema>>({
    resolver: zodResolver(announcementSchema),
    defaultValues: { audienceScope: "ALL" },
  });
  const audienceScope = form.watch("audienceScope");

  const createMutation = useMutation({
    mutationFn: (values: z.infer<typeof announcementSchema>) => {
      const { classroomId, ...rest } = values;
      return createAnnouncement({ ...rest, ...(classroomId ? { classroomId } : {}) }, creds);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["announcements", session.subdomain] });
      form.reset({ audienceScope: "ALL" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => removeAnnouncement(id, creds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["announcements", session.subdomain] });
    },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("announcements.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("announcements.subtitle")}</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        {(announcements.data ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">{t("announcements.empty")}</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {(announcements.data ?? []).map((announcement) => (
              <li key={announcement.id} className="border-b border-slate-100 pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{announcement.title}</p>
                    <p className="text-slate-600">{announcement.body}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {t(`announcements.audience.${announcement.audienceScope}`)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-xs text-slate-400 hover:text-red-600"
                    onClick={() => removeMutation.mutate(announcement.id)}
                  >
                    {t("discipline.remove")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form
          onSubmit={(event) => void form.handleSubmit((values) => createMutation.mutate(values))(event)}
          className="mt-4 flex flex-wrap items-end gap-3"
        >
          <input
            placeholder={t("announcements.form.title")}
            className="input w-48"
            {...form.register("title")}
          />
          <input
            placeholder={t("announcements.form.body")}
            className="input w-64"
            {...form.register("body")}
          />
          <select className="input w-40" {...form.register("audienceScope")}>
            {AUDIENCES.map((audience) => (
              <option key={audience} value={audience}>
                {t(`announcements.audience.${audience}`)}
              </option>
            ))}
          </select>
          {audienceScope === "CLASSROOM" ? (
            <select className="input w-40" {...form.register("classroomId")}>
              <option value="">{t("studentDetail.selectClassroom")}</option>
              {(classrooms.data ?? []).map((classroom) => (
                <option key={classroom.id} value={classroom.id}>
                  {classroom.name}
                </option>
              ))}
            </select>
          ) : null}
          <Button type="submit" variant="secondary">
            {t("announcements.publish")}
          </Button>
        </form>
      </section>
    </div>
  );
}
