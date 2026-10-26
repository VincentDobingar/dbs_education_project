import { Button } from "@edumanage/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { formatAmount, listPlatformPayouts, markPayoutPaid } from "../../lib/remedialApi.js";
import { useRequiredAdminSession } from "../../lib/useAdminSession.js";

/** Reversements des cours de renforcement : enseignants, établissements, commission DBSA. */
export function AdminRemedialPayoutsPage(): ReactNode {
  const { t, i18n } = useTranslation("app");
  const session = useRequiredAdminSession();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<"PENDING" | "PAID" | "">("PENDING");
  const [justification, setJustification] = useState(t("remedial.admin.defaultJustification"));
  const [references, setReferences] = useState<Record<string, string>>({});
  const payouts = useQuery({
    queryKey: ["admin-remedial-payouts", status],
    queryFn: () => listPlatformPayouts(status, session.accessToken),
  });
  const mark = useMutation({
    mutationFn: (id: string) => markPayoutPaid(id, references[id] ?? "", justification, session.accessToken),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-remedial-payouts"] }),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("remedial.admin.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("remedial.admin.subtitle")}</p>
      </div>
      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <select
            className="input w-48"
            value={status}
            onChange={(e) => setStatus(e.target.value as "PENDING" | "PAID" | "")}
          >
            <option value="PENDING">{t("remedial.status.PENDING")}</option>
            <option value="PAID">{t("remedial.status.PAID")}</option>
            <option value="">{t("admin.common.allStatuses")}</option>
          </select>
          <label className="flex-1 text-sm font-medium text-slate-700">
            {t("admin.common.justification")}
            <input
              className="input mt-1 w-full"
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
            />
          </label>
        </div>
        {(payouts.data ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">{t("admin.common.empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="pb-2 pr-4 font-medium">{t("remedial.payouts.course")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("remedial.roster.school")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("remedial.payouts.beneficiary")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("remedial.payouts.amount")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("remedial.roster.status")}</th>
                </tr>
              </thead>
              <tbody>
                {(payouts.data ?? []).map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 align-top last:border-0">
                    <td className="py-2 pr-4 text-slate-800">
                      {row.offerTitle}
                      <span className="block text-xs text-slate-400">{row.reference}</span>
                    </td>
                    <td className="py-2 pr-4 text-slate-600">{row.schoolName}</td>
                    <td className="py-2 pr-4 text-slate-600">
                      {t(`remedial.beneficiary.${row.beneficiary}`)}
                    </td>
                    <td className="py-2 pr-4 text-slate-800">
                      {formatAmount(row.amountCents, row.currency, i18n.language)}
                    </td>
                    <td className="py-2 pr-4">
                      {row.status === "PENDING" && row.beneficiary !== "PLATFORM" ? (
                        <div className="flex items-center gap-2">
                          <input
                            className="input w-40 py-1"
                            placeholder={t("remedial.admin.reference")}
                            value={references[row.id] ?? ""}
                            onChange={(e) => setReferences({ ...references, [row.id]: e.target.value })}
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={!references[row.id] || !justification.trim() || mark.isPending}
                            onClick={() => mark.mutate(row.id)}
                          >
                            {t("remedial.admin.markPaid")}
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">
                          {t(`remedial.status.${row.status}`)}
                          {row.paidReference ? ` · ${row.paidReference}` : ""}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
