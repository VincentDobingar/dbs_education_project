import { Button } from "@edumanage/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  extendTrial,
  forceTransition,
  getPlatformSubscription,
  listPlatformSubscriptions,
  sweepExpiredSubscriptions,
  type SubscriberCategory,
  type SubscriptionStatus,
} from "../../lib/platformAdminApi.js";
import { useRequiredAdminSession } from "../../lib/useAdminSession.js";

const STATUSES: SubscriptionStatus[] = [
  "DRAFT",
  "PENDING_PAYMENT",
  "PENDING_ACTIVATION",
  "TRIAL",
  "ACTIVE",
  "PAST_DUE",
  "GRACE_PERIOD",
  "SUSPENDED",
  "EXPIRED",
  "CANCELLED",
  "REFUNDED",
];
const OWNER_TYPES: SubscriberCategory[] = ["SCHOOL", "PARENT", "STUDENT", "ORGANIZATION"];

function ownerLabel(subscription: {
  owner: {
    ownerType: string;
    tenant: { name: string } | null;
    student: { firstName: string; lastName: string } | null;
    organization: { name: string } | null;
  };
}): string {
  const { owner } = subscription;
  if (owner.tenant) return owner.tenant.name;
  if (owner.student) return `${owner.student.firstName} ${owner.student.lastName}`;
  if (owner.organization) return owner.organization.name;
  return owner.ownerType;
}

export function AdminSubscriptionsPage(): ReactNode {
  const { t } = useTranslation("app");
  const session = useRequiredAdminSession();
  const creds = { accessToken: session.accessToken };
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<SubscriptionStatus | "">("");
  const [ownerTypeFilter, setOwnerTypeFilter] = useState<SubscriberCategory | "">("");
  const subscriptions = useQuery({
    queryKey: ["admin-subscriptions", statusFilter, ownerTypeFilter],
    queryFn: () =>
      listPlatformSubscriptions(
        {
          ...(statusFilter ? { status: statusFilter } : {}),
          ...(ownerTypeFilter ? { ownerType: ownerTypeFilter } : {}),
        },
        creds,
      ),
  });

  const [selectedId, setSelectedId] = useState("");
  const selected = useQuery({
    queryKey: ["admin-subscription", selectedId],
    queryFn: () => getPlatformSubscription(selectedId, creds),
    enabled: Boolean(selectedId),
  });

  const [justification, setJustification] = useState("");
  const [toStatus, setToStatus] = useState<SubscriptionStatus>("ACTIVE");
  const [trialEndsAt, setTrialEndsAt] = useState("");

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ["admin-subscriptions"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-subscription", selectedId] });
    setJustification("");
  }

  const transitionMutation = useMutation({
    mutationFn: () => forceTransition(selectedId, toStatus, justification, creds),
    onSuccess: invalidate,
  });
  const extendMutation = useMutation({
    mutationFn: () => extendTrial(selectedId, new Date(trialEndsAt).toISOString(), justification, creds),
    onSuccess: invalidate,
  });
  const sweepMutation = useMutation({
    mutationFn: () => sweepExpiredSubscriptions(creds),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-subscriptions"] }),
  });

  const canAct = justification.trim().length > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("admin.subscriptions.title")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("admin.subscriptions.subtitle")}</p>
        </div>
        <Button variant="secondary" disabled={sweepMutation.isPending} onClick={() => sweepMutation.mutate()}>
          {t("admin.subscriptions.sweepExpired")}
        </Button>
      </div>
      {sweepMutation.data ? (
        <p className="text-sm text-slate-600">
          {t("admin.subscriptions.sweptCount", { count: sweepMutation.data.swept })}
        </p>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <select
            className="input w-56"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as SubscriptionStatus | "")}
          >
            <option value="">{t("admin.common.allStatuses")}</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`admin.subscriptions.status.${status}`)}
              </option>
            ))}
          </select>
          <select
            className="input w-48"
            value={ownerTypeFilter}
            onChange={(event) => setOwnerTypeFilter(event.target.value as SubscriberCategory | "")}
          >
            <option value="">{t("admin.subscriptions.allOwnerTypes")}</option>
            {OWNER_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`admin.subscriptions.ownerType.${type}`)}
              </option>
            ))}
          </select>
        </div>

        {(subscriptions.data ?? []).length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">{t("admin.common.empty")}</p>
        ) : (
          <table className="mt-4 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="pb-2 pr-4 font-medium">{t("admin.subscriptions.owner")}</th>
                <th className="pb-2 pr-4 font-medium">{t("admin.subscriptions.plan")}</th>
                <th className="pb-2 pr-4 font-medium">{t("students.status")}</th>
                <th className="pb-2 pr-4" />
              </tr>
            </thead>
            <tbody>
              {(subscriptions.data ?? []).map((subscription) => (
                <tr key={subscription.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-4 text-slate-700">{ownerLabel(subscription)}</td>
                  <td className="py-2 pr-4 text-slate-700">{subscription.plan.nameFr}</td>
                  <td className="py-2 pr-4 text-slate-700">
                    {t(`admin.subscriptions.status.${subscription.status}`)}
                  </td>
                  <td className="py-2 pr-4">
                    <button
                      type="button"
                      className="text-xs text-brand-teal hover:underline"
                      onClick={() => {
                        setSelectedId(subscription.id);
                        setJustification("");
                      }}
                    >
                      {t("admin.common.open")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {selected.data ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">{ownerLabel(selected.data)}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {selected.data.plan.nameFr} · {t(`admin.subscriptions.status.${selected.data.status}`)}
          </p>

          <label className="mt-4 block text-sm font-medium text-slate-700">
            {t("admin.common.justification")}
            <input
              className="input mt-1 w-full"
              value={justification}
              onChange={(event) => setJustification(event.target.value)}
              placeholder={t("admin.common.justificationPlaceholder")}
            />
          </label>

          <div className="mt-3 flex flex-wrap items-end gap-3">
            <select
              className="input w-56"
              value={toStatus}
              onChange={(event) => setToStatus(event.target.value as SubscriptionStatus)}
            >
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`admin.subscriptions.status.${status}`)}
                </option>
              ))}
            </select>
            <Button
              variant="secondary"
              disabled={!canAct || transitionMutation.isPending}
              onClick={() => transitionMutation.mutate()}
            >
              {t("admin.subscriptions.action.forceTransition")}
            </Button>
          </div>

          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-sm font-medium text-slate-700">
              {t("admin.subscriptions.trialEndsAt")}
              <input
                type="date"
                className="input mt-1"
                value={trialEndsAt}
                onChange={(event) => setTrialEndsAt(event.target.value)}
              />
            </label>
            <Button
              variant="secondary"
              disabled={!canAct || !trialEndsAt || extendMutation.isPending}
              onClick={() => extendMutation.mutate()}
            >
              {t("admin.subscriptions.action.extendTrial")}
            </Button>
          </div>

          {selected.data.events && selected.data.events.length > 0 ? (
            <div className="mt-6 border-t border-slate-100 pt-4">
              <h3 className="text-sm font-semibold text-slate-900">{t("admin.subscriptions.history")}</h3>
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                {selected.data.events.map((event) => (
                  <li key={event.id}>
                    {new Date(event.createdAt).toLocaleString()} · {event.fromStatus ?? "—"} →{" "}
                    {event.toStatus}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
