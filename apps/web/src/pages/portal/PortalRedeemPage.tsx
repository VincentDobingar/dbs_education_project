import { Button } from "@edumanage/ui";
import { useMutation } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { ApiError } from "../../lib/apiClient.js";
import { redeemActivation } from "../../lib/familyApi.js";
import { loadPortalSession } from "../../lib/portalSession.js";

export function PortalRedeemPage(): ReactNode {
  const { t } = useTranslation("app");
  const navigate = useNavigate();
  const session = loadPortalSession();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const redeemMutation = useMutation({
    mutationFn: () => {
      if (!session) throw new Error("Not logged in");
      return redeemActivation(code, session.accessToken);
    },
    onSuccess: (result) => {
      setError(null);
      void navigate(result.beneficiaryCategory === "STUDENT" ? "/portail/eleve" : "/portail/parent");
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setError(t(`portal.redeem.error.${err.code}`, { defaultValue: t("portal.error.generic") }));
      } else {
        setError(t("portal.error.generic"));
      }
    },
  });

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-2xl font-bold text-slate-900">{t("portal.redeem.title")}</h1>
      <p className="mt-2 text-sm text-slate-600">{t("portal.redeem.subtitle")}</p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          redeemMutation.mutate();
        }}
        className="mt-6 space-y-4"
      >
        <input
          placeholder={t("portal.redeem.codePlaceholder")}
          className="input w-full"
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
        <Button type="submit" variant="secondary" disabled={!code || redeemMutation.isPending}>
          {redeemMutation.isPending ? t("portal.redeem.submitting") : t("portal.redeem.submit")}
        </Button>
      </form>
      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
