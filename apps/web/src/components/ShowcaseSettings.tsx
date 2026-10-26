import { Button } from "@edumanage/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { TenantCredentials } from "../lib/apiClient.js";
import {
  getTenantShowcase,
  PUBLIC_DESCRIPTION_MAX_LENGTH,
  updateTenantShowcase,
} from "../lib/schoolConfigApi.js";

/** Configuration : présentation de l'établissement dans le carrousel de la page d'accueil. */
export function ShowcaseSettings({ creds }: { creds: TenantCredentials }): ReactNode {
  const { t } = useTranslation("app");
  const queryClient = useQueryClient();
  const queryKey = ["tenant-showcase", creds.subdomain];
  const showcase = useQuery({ queryKey, queryFn: () => getTenantShowcase(creds) });

  const [description, setDescription] = useState("");
  const [showOnHomepage, setShowOnHomepage] = useState(true);
  useEffect(() => {
    if (showcase.data) {
      setDescription(showcase.data.publicDescription ?? "");
      setShowOnHomepage(showcase.data.showOnHomepage);
    }
  }, [showcase.data]);

  const save = useMutation({
    mutationFn: () => updateTenantShowcase({ publicDescription: description, showOnHomepage }, creds),
    onSuccess: (data) => queryClient.setQueryData(queryKey, data),
  });

  function submit(event: FormEvent): void {
    event.preventDefault();
    save.mutate();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm text-slate-500">{t("config.showcase.help")}</p>
      <label className="block text-sm font-medium text-slate-700">
        {t("config.showcase.description")}
        <textarea
          className="input mt-1 h-20 w-full"
          maxLength={PUBLIC_DESCRIPTION_MAX_LENGTH}
          value={description}
          placeholder={t("config.showcase.placeholder")}
          onChange={(event) => setDescription(event.target.value)}
        />
        <span className="mt-1 block text-right text-xs text-slate-400">
          {description.length}/{PUBLIC_DESCRIPTION_MAX_LENGTH}
        </span>
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={showOnHomepage}
          onChange={(event) => setShowOnHomepage(event.target.checked)}
        />
        {t("config.showcase.visible")}
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" disabled={save.isPending || showcase.isPending}>
          {t("config.showcase.save")}
        </Button>
        {save.isSuccess ? (
          <span className="text-sm text-emerald-700">{t("config.showcase.saved")}</span>
        ) : null}
        {save.isError ? <span className="text-sm text-red-600">{t("config.showcase.error")}</span> : null}
      </div>
    </form>
  );
}
