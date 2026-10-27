import { Button } from "@edumanage/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { formatMoney, listFeeSettlements, markFeeSettlementPaid } from "../../lib/feesApi.js";
import { useRequiredAdminSession } from "../../lib/useAdminSession.js";

/** Frais scolaires payés en ligne : encaissés par DBSA, à reverser à chaque établissement. */
export function AdminFeeSettlementsPage(): ReactNode {
  const { t } = useTranslation("app");
  const session = useRequiredAdminSession();
  const queryClient = useQueryClient();
  const [justification, setJustification] = useState(t("fees.settlements.defaultJustification"));
  const [references, setReferences] = useState<Record<string, string>>({});
  const rows = useQuery({
    queryKey: ["admin-fee-settlements"],
    queryFn: () => listFeeSettlements(session.accessToken),
  });
  const mark = useMutation({
    mutationFn: (tenantId: string) =>
      markFeeSettlementPaid(
        tenantId,
        { reference: references[tenantId] ?? "", justification },
        session.accessToken,
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-fee-settlements"] }),
  });
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("fees.settlements.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("fees.settlements.subtitle")}</p>
      </div>
      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <label className="block text-sm font-medium text-slate-700">
          {t("admin.common.justification")}
          <input
            className="input mt-1 w-full"
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
          />
        </label>
        {(rows.data ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">{t("admin.common.empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="pb-2 pr-4 font-medium">{t("fees.settlements.school")}</th>
                  <th className="pb-2 pr-4 text-right font-medium">{t("fees.settlements.pending")}</th>
                  <th className="pb-2 pr-4 text-right font-medium">{t("fees.settlements.settled")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("fees.settlements.reference")}</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {(rows.data ?? []).map((row) => (
                  <tr key={row.tenantId} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-4">{row.tenantName}</td>
                    <td className="py-2 pr-4 text-right font-medium">
                      {formatMoney(row.pendingCents)}
                      <span className="block text-xs text-slate-500">
                        {t("fees.settlements.payments", { count: row.pendingPayments })}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-right">{formatMoney(row.settledCents)}</td>
                    <td className="py-2 pr-4">
                      <input
                        className="input w-40"
                        value={references[row.tenantId] ?? ""}
                        onChange={(e) => setReferences({ ...references, [row.tenantId]: e.target.value })}
                      />
                    </td>
                    <td className="py-2 text-right">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={
                          row.pendingCents === 0 ||
                          !references[row.tenantId] ||
                          !justification ||
                          mark.isPending
                        }
                        onClick={() => mark.mutate(row.tenantId)}
                      >
                        {t("fees.settlements.markPaid")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {mark.isError ? (
          <p className="text-sm text-red-600">{mark.error instanceof Error ? mark.error.message : ""}</p>
        ) : null}
      </section>
    </div>
  );
}
