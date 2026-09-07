import { Button } from "@edumanage/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  deletePlatformSetting,
  listPlatformSettings,
  upsertPlatformSetting,
} from "../../lib/platformAdminApi.js";
import { useRequiredAdminSession } from "../../lib/useAdminSession.js";

export function AdminPlatformSettingsPage(): ReactNode {
  const { t } = useTranslation("app");
  const session = useRequiredAdminSession();
  const creds = { accessToken: session.accessToken };
  const queryClient = useQueryClient();

  const settings = useQuery({
    queryKey: ["admin-platform-settings"],
    queryFn: () => listPlatformSettings(creds),
  });

  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const upsertMutation = useMutation({
    mutationFn: () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch {
        parsed = value;
      }
      return upsertPlatformSetting(key, parsed, creds);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-platform-settings"] });
      setKey("");
      setValue("");
      setFormError(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (settingKey: string) => deletePlatformSetting(settingKey, creds),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-platform-settings"] }),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("admin.platformSettings.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("admin.platformSettings.subtitle")}</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        {(settings.data ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">{t("admin.common.empty")}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="pb-2 pr-4 font-medium">{t("admin.platformSettings.key")}</th>
                <th className="pb-2 pr-4 font-medium">{t("admin.platformSettings.value")}</th>
                <th className="pb-2 pr-4" />
              </tr>
            </thead>
            <tbody>
              {(settings.data ?? []).map((setting) => (
                <tr key={setting.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-4 text-slate-700">{setting.key}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-slate-500">
                    {JSON.stringify(setting.value)}
                  </td>
                  <td className="py-2 pr-4">
                    <button
                      type="button"
                      className="text-xs text-red-600 hover:underline"
                      onClick={() => deleteMutation.mutate(setting.key)}
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
            setFormError(null);
            upsertMutation.mutate();
          }}
          className="mt-4 flex flex-wrap items-end gap-3"
        >
          <input
            placeholder={t("admin.platformSettings.key")}
            className="input w-56"
            value={key}
            onChange={(event) => setKey(event.target.value)}
          />
          <input
            placeholder={t("admin.platformSettings.valuePlaceholder")}
            className="input w-64"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <Button type="submit" variant="secondary" disabled={!key || !value || upsertMutation.isPending}>
            {t("admin.common.save")}
          </Button>
        </form>
        {formError ? <p className="mt-2 text-sm text-red-600">{formError}</p> : null}
      </section>
    </div>
  );
}
