import { Button } from "@edumanage/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  createMessageTemplate,
  deleteMessageTemplate,
  listMessageTemplates,
  type NotificationChannel,
} from "../../lib/platformAdminApi.js";
import { useRequiredAdminSession } from "../../lib/useAdminSession.js";

const CHANNELS: NotificationChannel[] = ["EMAIL", "SMS", "PUSH", "IN_APP"];

export function AdminMessageTemplatesPage(): ReactNode {
  const { t } = useTranslation("app");
  const session = useRequiredAdminSession();
  const creds = { accessToken: session.accessToken };
  const queryClient = useQueryClient();

  const templates = useQuery({
    queryKey: ["admin-message-templates"],
    queryFn: () => listMessageTemplates({}, creds),
  });

  const [form, setForm] = useState<{
    code: string;
    channel: NotificationChannel;
    subject: string;
    bodyFr: string;
    bodyEn: string;
  }>({ code: "", channel: "EMAIL", subject: "", bodyFr: "", bodyEn: "" });

  const createMutation = useMutation({
    mutationFn: () =>
      createMessageTemplate(
        {
          code: form.code,
          channel: form.channel,
          ...(form.subject ? { subject: form.subject } : {}),
          bodyFr: form.bodyFr,
          bodyEn: form.bodyEn,
        },
        creds,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-message-templates"] });
      setForm({ code: "", channel: "EMAIL", subject: "", bodyFr: "", bodyEn: "" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMessageTemplate(id, creds),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-message-templates"] }),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("admin.messageTemplates.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("admin.messageTemplates.subtitle")}</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        {(templates.data ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">{t("admin.common.empty")}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="pb-2 pr-4 font-medium">{t("admin.messageTemplates.code")}</th>
                <th className="pb-2 pr-4 font-medium">{t("admin.messageTemplates.channel")}</th>
                <th className="pb-2 pr-4 font-medium">{t("admin.messageTemplates.scope")}</th>
                <th className="pb-2 pr-4" />
              </tr>
            </thead>
            <tbody>
              {(templates.data ?? []).map((template) => (
                <tr key={template.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-4 text-slate-700">{template.code}</td>
                  <td className="py-2 pr-4 text-slate-700">{template.channel}</td>
                  <td className="py-2 pr-4 text-slate-700">
                    {template.tenantId ? template.tenantId : t("admin.messageTemplates.global")}
                  </td>
                  <td className="py-2 pr-4">
                    <button
                      type="button"
                      className="text-xs text-red-600 hover:underline"
                      onClick={() => deleteMutation.mutate(template.id)}
                    >
                      {t("admin.common.delete")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate();
          }}
          className="mt-4 space-y-3"
        >
          <div className="flex flex-wrap items-end gap-3">
            <input
              placeholder={t("admin.messageTemplates.code")}
              className="input w-56"
              value={form.code}
              onChange={(event) => setForm({ ...form, code: event.target.value })}
            />
            <select
              className="input w-40"
              value={form.channel}
              onChange={(event) => setForm({ ...form, channel: event.target.value as NotificationChannel })}
            >
              {CHANNELS.map((channel) => (
                <option key={channel} value={channel}>
                  {channel}
                </option>
              ))}
            </select>
            <input
              placeholder={t("admin.messageTemplates.subject")}
              className="input w-64"
              value={form.subject}
              onChange={(event) => setForm({ ...form, subject: event.target.value })}
            />
          </div>
          <textarea
            placeholder={t("admin.messageTemplates.bodyFr")}
            className="input w-full"
            rows={2}
            value={form.bodyFr}
            onChange={(event) => setForm({ ...form, bodyFr: event.target.value })}
          />
          <textarea
            placeholder={t("admin.messageTemplates.bodyEn")}
            className="input w-full"
            rows={2}
            value={form.bodyEn}
            onChange={(event) => setForm({ ...form, bodyEn: event.target.value })}
          />
          <Button
            type="submit"
            variant="secondary"
            disabled={!form.code || !form.bodyFr || !form.bodyEn || createMutation.isPending}
          >
            {t("admin.common.create")}
          </Button>
        </form>
      </section>
    </div>
  );
}
