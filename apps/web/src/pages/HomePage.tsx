import { Button } from "@edumanage/ui";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export function HomePage(): ReactNode {
  const { t } = useTranslation();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-8">
      <h1 className="text-3xl font-semibold text-slate-900">{t("app.name")}</h1>
      <p className="text-slate-600">{t("state.empty")}</p>
      <Button variant="secondary">{t("action.confirm")}</Button>
    </main>
  );
}
