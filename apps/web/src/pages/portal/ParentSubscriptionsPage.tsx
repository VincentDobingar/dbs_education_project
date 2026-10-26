import { Button } from "@edumanage/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import {
  attachParentChildren,
  cancelParentSubscription,
  getCoverageOptions,
  getParentPlans,
  getParentSubscriptions,
  invoiceParentSubscription,
  prepareParentPayment,
  subscribeParent,
} from "../../lib/parentAccountApi.js";
import { loadPortalSession } from "../../lib/portalSession.js";

export function ParentSubscriptionsPage(): ReactNode {
  const session = loadPortalSession()!;
  const client = useQueryClient();
  const [planCode, setPlanCode] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [period, setPeriod] = useState("MONTHLY");
  const [selected, setSelected] = useState<string[]>([]);
  const [currency, setCurrency] = useState("XAF");
  const [paymentReference, setPaymentReference] = useState("");
  const options = useQuery({
    queryKey: ["parent-coverage-options", session.accessToken],
    queryFn: () => getCoverageOptions(session.accessToken),
  });
  const plans = useQuery({
    queryKey: ["parent-plans", session.accessToken],
    queryFn: () => getParentPlans(session.accessToken),
  });
  const subscriptions = useQuery({
    queryKey: ["parent-subscriptions", session.accessToken],
    queryFn: () => getParentSubscriptions(session.accessToken),
  });
  const children = (options.data ?? [])
    .filter((child) => selected.includes(`${child.studentId}:${child.tenantId}`))
    .map(({ studentId, tenantId }) => ({ studentId, tenantId }));
  const refresh = (): void => {
    void client.invalidateQueries({ queryKey: ["parent-subscriptions", session.accessToken] });
    void client.invalidateQueries({ queryKey: ["parent-coverage-options", session.accessToken] });
    void client.invalidateQueries({ queryKey: ["parent-dashboard", session.accessToken] });
  };
  const create = useMutation({
    mutationFn: () =>
      subscribeParent(
        {
          planCode,
          billingPeriod: period,
          children,
          ...(promoCode.trim() ? { promoCode: promoCode.trim() } : {}),
        },
        session.accessToken,
      ),
    onSuccess: () => {
      setSelected([]);
      refresh();
    },
  });
  const attach = useMutation({
    mutationFn: (id: string) => attachParentChildren(id, children, session.accessToken),
    onSuccess: refresh,
  });
  const cancel = useMutation({
    mutationFn: (id: string) => cancelParentSubscription(id, session.accessToken),
    onSuccess: refresh,
  });
  const invoice = useMutation({
    mutationFn: async (id: string) => {
      const existing = subscriptions.data
        ?.find((s) => s.id === id)
        ?.invoices.find((i) => i.status === "ISSUED");
      const bill =
        existing ??
        (await invoiceParentSubscription(
          id,
          {
            currencyIsoCode: currency.toUpperCase(),
            billingName: session.email,
            billingEmail: session.email,
          },
          session.accessToken,
        ));
      const intent = await prepareParentPayment(id, bill.id, session.accessToken);
      return `Facture ${bill.number} · référence de règlement ${intent.id}`;
    },
    onSuccess: (reference) => {
      setPaymentReference(reference);
      refresh();
    },
  });
  const selectedPlan = plans.data?.find((p) => p.code === planCode);
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-6 py-10">
      <h1 className="text-2xl font-bold">Mes abonnements et mes enfants couverts</h1>
      <p className="text-slate-600">
        Une couverture correspond à un enfant dans un établissement. Le dashboard affiche uniquement les
        enfants couverts par un abonnement actif. Une formule familiale peut regrouper plusieurs
        établissements.
      </p>
      <Link className="text-teal-700 underline" to="/portail/parent">
        Revenir au tableau de bord
      </Link>
      {[options, plans, subscriptions].some((q) => q.isError) && (
        <p role="alert">Impossible de charger les abonnements. Réessayez.</p>
      )}
      <section className="space-y-3 rounded-lg border bg-white p-5">
        <h2 className="font-semibold">Choisir les enfants et établissements</h2>
        {options.isPending && <p>Chargement…</p>}
        {options.data?.length === 0 && (
          <p>
            Aucun enfant vérifié.{" "}
            <Link className="underline" to="/portail/activation">
              Activer une invitation de l'établissement
            </Link>
            .
          </p>
        )}
        {options.data?.map((child) => {
          const key = `${child.studentId}:${child.tenantId}`;
          return (
            <label key={key} className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={selected.includes(key)}
                onChange={(event) =>
                  setSelected((current) =>
                    event.target.checked ? [...current, key] : current.filter((item) => item !== key),
                  )
                }
              />
              {child.firstName} {child.lastName} · {child.tenantName} ·{" "}
              {child.covered ? "Couvert" : "Non couvert"}
            </label>
          );
        })}
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <label>
            Formule
            <select
              className="input block"
              required
              value={planCode}
              onChange={(event) => setPlanCode(event.target.value)}
            >
              <option value="">Choisir</option>
              {plans.data?.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.nameFr} — {p.childrenCovered ?? 1} enfant(s)
                </option>
              ))}
            </select>
          </label>
          <label>
            Périodicité
            <select
              className="input block"
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
            >
              <option value="MONTHLY">Mensuelle</option>
              <option value="ANNUAL">Annuelle</option>
            </select>
          </label>
          <label>
            Code promotionnel (facultatif)
            <input
              className="input block"
              value={promoCode}
              onChange={(event) => setPromoCode(event.target.value)}
            />
          </label>
          <Button
            type="submit"
            disabled={
              !children.length ||
              !planCode ||
              children.length > (selectedPlan?.childrenCovered ?? 1) ||
              create.isPending
            }
          >
            Créer l'abonnement
          </Button>
        </form>
        <p className="text-sm text-slate-600">
          {children.length} sélection(s). Une souscription reste inactive jusqu'à confirmation du paiement.
          Une couverture déjà réservée doit être annulée avant de changer de formule.
        </p>
        {create.isSuccess && <p role="status">Abonnement créé. Préparez son règlement ci-dessous.</p>}
      </section>
      <label className="block">
        Devise du règlement (code ISO)
        <input
          className="input ml-3 w-24"
          maxLength={3}
          value={currency}
          onChange={(event) => setCurrency(event.target.value.toUpperCase())}
        />
      </label>
      <section className="space-y-3">
        <h2 className="font-semibold">Mes souscriptions</h2>
        {subscriptions.data?.map((subscription) => (
          <article key={subscription.id} className="space-y-3 rounded-lg border bg-white p-5">
            <h3 className="font-semibold">
              {subscription.plan.nameFr} · {subscription.status}
            </h3>
            {subscription.parentCoverages.length === 0 ? (
              <>
                <p>
                  Cet ancien abonnement n'a pas encore de sélection d'enfants. Sélectionnez-les ci-dessus pour
                  le rattacher.
                </p>
                <Button
                  type="button"
                  disabled={!children.length || attach.isPending}
                  onClick={() => attach.mutate(subscription.id)}
                >
                  Rattacher les enfants sélectionnés
                </Button>
              </>
            ) : (
              <ul>
                {subscription.parentCoverages.map((coverage) => {
                  const child = options.data?.find(
                    (o) => o.studentId === coverage.studentId && o.tenantId === coverage.tenantId,
                  );
                  return (
                    <li key={`${coverage.studentId}:${coverage.tenantId}`}>
                      {child
                        ? `${child.firstName} ${child.lastName} · ${child.tenantName}`
                        : "Enfant précédemment rattaché"}
                      {coverage.releasedAt ? " · couverture terminée" : ""}
                    </li>
                  );
                })}
              </ul>
            )}
            {["DRAFT", "PENDING_PAYMENT"].includes(subscription.status) && (
              <Button
                type="button"
                disabled={invoice.isPending || subscription.parentCoverages.length === 0}
                onClick={() => invoice.mutate(subscription.id)}
              >
                Préparer ou retrouver le règlement
              </Button>
            )}
            {subscription.invoices.map((bill) => (
              <p key={bill.id} className="text-sm">
                Facture {bill.number} · {(bill.totalCents / 100).toLocaleString("fr-FR")} · {bill.status}
              </p>
            ))}
            {!["CANCELLED", "REFUNDED"].includes(subscription.status) && (
              <button
                type="button"
                className="block text-sm text-red-700 underline"
                disabled={cancel.isPending}
                onClick={() => cancel.mutate(subscription.id)}
              >
                Annuler cet abonnement
              </button>
            )}
          </article>
        ))}
      </section>
      {paymentReference && (
        <p role="status" className="rounded border bg-teal-50 p-4">
          {paymentReference}. Présentez cette référence à un agent de facturation habilité. L'accès s'ouvrira
          après confirmation réelle de l'encaissement.
        </p>
      )}
      {[create, attach, cancel, invoice].map(
        (mutation, index) =>
          mutation.isError && (
            <p key={index} role="alert" className="text-red-600">
              {mutation.error.message}
            </p>
          ),
      )}
    </main>
  );
}
