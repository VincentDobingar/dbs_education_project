import { Button } from "@edumanage/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  createCountry,
  createCurrency,
  createPaymentProvider,
  listCountries,
  listCurrencies,
  listPaymentProviders,
  updateCountry,
  updateCurrency,
  updatePaymentProvider,
  type PaymentMethodType,
} from "../../lib/platformAdminApi.js";
import { useRequiredAdminSession } from "../../lib/useAdminSession.js";

const PAYMENT_METHOD_TYPES: PaymentMethodType[] = [
  "CASH",
  "BANK_TRANSFER",
  "CARD",
  "MOBILE_MONEY",
  "WALLET",
  "PREPAID_CODE",
  "SPONSOR",
];

type Tab = "countries" | "currencies" | "paymentProviders";

export function AdminReferenceDataPage(): ReactNode {
  const { t } = useTranslation("app");
  const session = useRequiredAdminSession();
  const creds = { accessToken: session.accessToken };
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("countries");

  const countries = useQuery({ queryKey: ["admin-countries"], queryFn: () => listCountries(creds) });
  const currencies = useQuery({ queryKey: ["admin-currencies"], queryFn: () => listCurrencies(creds) });
  const providers = useQuery({
    queryKey: ["admin-payment-providers"],
    queryFn: () => listPaymentProviders(creds),
  });

  const [countryForm, setCountryForm] = useState({
    isoCode: "",
    nameFr: "",
    nameEn: "",
    phoneCallingCode: "",
  });
  const createCountryMutation = useMutation({
    mutationFn: () => createCountry(countryForm, creds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-countries"] });
      setCountryForm({ isoCode: "", nameFr: "", nameEn: "", phoneCallingCode: "" });
    },
  });
  const toggleCountryMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateCountry(id, { isActive }, creds),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-countries"] }),
  });

  const [currencyForm, setCurrencyForm] = useState({ isoCode: "", nameFr: "", nameEn: "", symbol: "" });
  const createCurrencyMutation = useMutation({
    mutationFn: () => createCurrency(currencyForm, creds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-currencies"] });
      setCurrencyForm({ isoCode: "", nameFr: "", nameEn: "", symbol: "" });
    },
  });
  const toggleCurrencyMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateCurrency(id, { isActive }, creds),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-currencies"] }),
  });

  const [providerForm, setProviderForm] = useState<{
    code: string;
    nameFr: string;
    nameEn: string;
    methodType: PaymentMethodType;
  }>({ code: "", nameFr: "", nameEn: "", methodType: "MOBILE_MONEY" });
  const createProviderMutation = useMutation({
    mutationFn: () => createPaymentProvider(providerForm, creds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-payment-providers"] });
      setProviderForm({ code: "", nameFr: "", nameEn: "", methodType: "MOBILE_MONEY" });
    },
  });
  const toggleProviderMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updatePaymentProvider(id, { isActive }, creds),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-payment-providers"] }),
  });

  const TABS: { key: Tab; label: string }[] = [
    { key: "countries", label: t("admin.referenceData.tab.countries") },
    { key: "currencies", label: t("admin.referenceData.tab.currencies") },
    { key: "paymentProviders", label: t("admin.referenceData.tab.paymentProviders") },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("admin.referenceData.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("admin.referenceData.subtitle")}</p>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        {TABS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => setTab(entry.key)}
            className={`px-3 py-2 text-sm font-medium ${
              tab === entry.key ? "border-b-2 border-brand-teal text-brand-teal" : "text-slate-500"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === "countries" ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="pb-2 pr-4 font-medium">{t("admin.referenceData.isoCode")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("admin.referenceData.nameFr")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("students.status")}</th>
                  <th className="pb-2 pr-4" />
                </tr>
              </thead>
              <tbody>
                {(countries.data ?? []).map((country) => (
                  <tr key={country.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-4 text-slate-700">{country.isoCode}</td>
                    <td className="py-2 pr-4 text-slate-700">{country.nameFr}</td>
                    <td className="py-2 pr-4 text-slate-700">
                      {country.isActive ? t("admin.common.active") : t("admin.common.inactive")}
                    </td>
                    <td className="py-2 pr-4">
                      <button
                        type="button"
                        className="text-xs text-brand-teal hover:underline"
                        onClick={() =>
                          toggleCountryMutation.mutate({ id: country.id, isActive: !country.isActive })
                        }
                      >
                        {country.isActive ? t("admin.common.deactivate") : t("admin.common.activate")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              createCountryMutation.mutate();
            }}
            className="mt-4 flex flex-wrap items-end gap-3"
          >
            <input
              placeholder={t("admin.referenceData.isoCode")}
              className="input w-24"
              value={countryForm.isoCode}
              onChange={(event) =>
                setCountryForm({ ...countryForm, isoCode: event.target.value.toUpperCase() })
              }
            />
            <input
              placeholder={t("admin.referenceData.nameFr")}
              className="input w-48"
              value={countryForm.nameFr}
              onChange={(event) => setCountryForm({ ...countryForm, nameFr: event.target.value })}
            />
            <input
              placeholder={t("admin.referenceData.nameEn")}
              className="input w-48"
              value={countryForm.nameEn}
              onChange={(event) => setCountryForm({ ...countryForm, nameEn: event.target.value })}
            />
            <input
              placeholder={t("admin.referenceData.phoneCallingCode")}
              className="input w-32"
              value={countryForm.phoneCallingCode}
              onChange={(event) => setCountryForm({ ...countryForm, phoneCallingCode: event.target.value })}
            />
            <Button type="submit" variant="secondary" disabled={createCountryMutation.isPending}>
              {t("admin.common.create")}
            </Button>
          </form>
        </section>
      ) : null}

      {tab === "currencies" ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="pb-2 pr-4 font-medium">{t("admin.referenceData.isoCode")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("admin.referenceData.nameFr")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("admin.referenceData.symbol")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("students.status")}</th>
                  <th className="pb-2 pr-4" />
                </tr>
              </thead>
              <tbody>
                {(currencies.data ?? []).map((currency) => (
                  <tr key={currency.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-4 text-slate-700">{currency.isoCode}</td>
                    <td className="py-2 pr-4 text-slate-700">{currency.nameFr}</td>
                    <td className="py-2 pr-4 text-slate-700">{currency.symbol}</td>
                    <td className="py-2 pr-4 text-slate-700">
                      {currency.isActive ? t("admin.common.active") : t("admin.common.inactive")}
                    </td>
                    <td className="py-2 pr-4">
                      <button
                        type="button"
                        className="text-xs text-brand-teal hover:underline"
                        onClick={() =>
                          toggleCurrencyMutation.mutate({ id: currency.id, isActive: !currency.isActive })
                        }
                      >
                        {currency.isActive ? t("admin.common.deactivate") : t("admin.common.activate")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              createCurrencyMutation.mutate();
            }}
            className="mt-4 flex flex-wrap items-end gap-3"
          >
            <input
              placeholder={t("admin.referenceData.isoCode")}
              className="input w-24"
              value={currencyForm.isoCode}
              onChange={(event) =>
                setCurrencyForm({ ...currencyForm, isoCode: event.target.value.toUpperCase() })
              }
            />
            <input
              placeholder={t("admin.referenceData.nameFr")}
              className="input w-48"
              value={currencyForm.nameFr}
              onChange={(event) => setCurrencyForm({ ...currencyForm, nameFr: event.target.value })}
            />
            <input
              placeholder={t("admin.referenceData.nameEn")}
              className="input w-48"
              value={currencyForm.nameEn}
              onChange={(event) => setCurrencyForm({ ...currencyForm, nameEn: event.target.value })}
            />
            <input
              placeholder={t("admin.referenceData.symbol")}
              className="input w-20"
              value={currencyForm.symbol}
              onChange={(event) => setCurrencyForm({ ...currencyForm, symbol: event.target.value })}
            />
            <Button type="submit" variant="secondary" disabled={createCurrencyMutation.isPending}>
              {t("admin.common.create")}
            </Button>
          </form>
        </section>
      ) : null}

      {tab === "paymentProviders" ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="pb-2 pr-4 font-medium">{t("admin.referenceData.code")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("admin.referenceData.nameFr")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("admin.referenceData.methodType")}</th>
                  <th className="pb-2 pr-4 font-medium">{t("students.status")}</th>
                  <th className="pb-2 pr-4" />
                </tr>
              </thead>
              <tbody>
                {(providers.data ?? []).map((provider) => (
                  <tr key={provider.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-4 text-slate-700">{provider.code}</td>
                    <td className="py-2 pr-4 text-slate-700">{provider.nameFr}</td>
                    <td className="py-2 pr-4 text-slate-700">
                      {t(`admin.referenceData.methodTypeValue.${provider.methodType}`)}
                    </td>
                    <td className="py-2 pr-4 text-slate-700">
                      {provider.isActive ? t("admin.common.active") : t("admin.common.inactive")}
                    </td>
                    <td className="py-2 pr-4">
                      <button
                        type="button"
                        className="text-xs text-brand-teal hover:underline"
                        onClick={() =>
                          toggleProviderMutation.mutate({ id: provider.id, isActive: !provider.isActive })
                        }
                      >
                        {provider.isActive ? t("admin.common.deactivate") : t("admin.common.activate")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              createProviderMutation.mutate();
            }}
            className="mt-4 flex flex-wrap items-end gap-3"
          >
            <input
              placeholder={t("admin.referenceData.code")}
              className="input w-40"
              value={providerForm.code}
              onChange={(event) => setProviderForm({ ...providerForm, code: event.target.value })}
            />
            <input
              placeholder={t("admin.referenceData.nameFr")}
              className="input w-48"
              value={providerForm.nameFr}
              onChange={(event) => setProviderForm({ ...providerForm, nameFr: event.target.value })}
            />
            <input
              placeholder={t("admin.referenceData.nameEn")}
              className="input w-48"
              value={providerForm.nameEn}
              onChange={(event) => setProviderForm({ ...providerForm, nameEn: event.target.value })}
            />
            <select
              className="input w-48"
              value={providerForm.methodType}
              onChange={(event) =>
                setProviderForm({ ...providerForm, methodType: event.target.value as PaymentMethodType })
              }
            >
              {PAYMENT_METHOD_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`admin.referenceData.methodTypeValue.${type}`)}
                </option>
              ))}
            </select>
            <Button type="submit" variant="secondary" disabled={createProviderMutation.isPending}>
              {t("admin.common.create")}
            </Button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
