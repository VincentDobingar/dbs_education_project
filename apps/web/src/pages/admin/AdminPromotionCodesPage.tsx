import { Button } from "@edumanage/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  createPromotionCode,
  listPromotionCodes,
  updatePromotionCode,
  type PromotionDiscountType,
} from "../../lib/platformAdminApi.js";
import { useRequiredAdminSession } from "../../lib/useAdminSession.js";

export function AdminPromotionCodesPage(): ReactNode {
  const { t } = useTranslation("app");
  const session = useRequiredAdminSession();
  const creds = { accessToken: session.accessToken };
  const queryClient = useQueryClient();

  const codes = useQuery({
    queryKey: ["admin-promotion-codes"],
    queryFn: () => listPromotionCodes({}, creds),
  });

  const [form, setForm] = useState<{
    code: string;
    discountType: PromotionDiscountType;
    discountValue: string;
    maxRedemptions: string;
  }>({ code: "", discountType: "PERCENTAGE", discountValue: "", maxRedemptions: "" });

  const createMutation = useMutation({
    mutationFn: () =>
      createPromotionCode(
        {
          code: form.code,
          discountType: form.discountType,
          discountValue: Number(form.discountValue),
          ...(form.maxRedemptions ? { maxRedemptions: Number(form.maxRedemptions) } : {}),
        },
        creds,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-promotion-codes"] });
      setForm({ code: "", discountType: "PERCENTAGE", discountValue: "", maxRedemptions: "" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updatePromotionCode(id, { isActive }, creds),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-promotion-codes"] }),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("admin.promotionCodes.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("admin.promotionCodes.subtitle")}</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        {(codes.data ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">{t("admin.common.empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="pb-2 pr-4 font-medium">{t("admin.promotionCodes.code")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("admin.promotionCodes.discount")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("admin.promotionCodes.redemptions")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("students.status")}</th>
                  <th className="pb-2 pr-4" />
                </tr>
              </thead>
              <tbody>
                {(codes.data ?? []).map((promo) => (
                  <tr key={promo.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-4 text-slate-700">{promo.code}</td>
                    <td className="py-2 pr-4 text-slate-700">
                      {promo.discountType === "PERCENTAGE" ? `${promo.discountValue}%` : promo.discountValue}
                    </td>
                    <td className="py-2 pr-4 text-slate-700">
                      {promo.redemptionCount}
                      {promo.maxRedemptions ? ` / ${promo.maxRedemptions}` : ""}
                    </td>
                    <td className="py-2 pr-4 text-slate-700">
                      {promo.isActive ? t("admin.common.active") : t("admin.common.inactive")}
                    </td>
                    <td className="py-2 pr-4">
                      <button
                        type="button"
                        className="text-xs text-brand-teal hover:underline"
                        onClick={() => toggleMutation.mutate({ id: promo.id, isActive: !promo.isActive })}
                      >
                        {promo.isActive ? t("admin.common.deactivate") : t("admin.common.activate")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate();
          }}
          className="mt-4 flex flex-wrap items-end gap-3"
        >
          <input
            placeholder={t("admin.promotionCodes.code")}
            className="input w-40"
            value={form.code}
            onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })}
          />
          <select
            className="input w-48"
            value={form.discountType}
            onChange={(event) =>
              setForm({ ...form, discountType: event.target.value as PromotionDiscountType })
            }
          >
            <option value="PERCENTAGE">{t("admin.promotionCodes.discountType.PERCENTAGE")}</option>
            <option value="FIXED_AMOUNT">{t("admin.promotionCodes.discountType.FIXED_AMOUNT")}</option>
          </select>
          <input
            type="number"
            placeholder={t("admin.promotionCodes.discountValue")}
            className="input w-32"
            value={form.discountValue}
            onChange={(event) => setForm({ ...form, discountValue: event.target.value })}
          />
          <input
            type="number"
            placeholder={t("admin.promotionCodes.maxRedemptions")}
            className="input w-40"
            value={form.maxRedemptions}
            onChange={(event) => setForm({ ...form, maxRedemptions: event.target.value })}
          />
          <Button
            type="submit"
            variant="secondary"
            disabled={!form.code || !form.discountValue || createMutation.isPending}
          >
            {t("admin.common.create")}
          </Button>
        </form>
      </section>
    </div>
  );
}
