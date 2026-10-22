import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import i18n from "../../i18n.js";
import type * as PublicApi from "../../lib/publicApi.js";

const api = vi.hoisted(() => ({
  listPublicCountriesOrSnapshot: vi.fn(),
  getPublicPricingOrSnapshot: vi.fn(),
}));

vi.mock("../../lib/publicApi.js", async (importOriginal) => ({
  ...(await importOriginal<typeof PublicApi>()),
  ...api,
}));

import { PricingPage } from "./PricingPage.js";

const XAF = {
  isoCode: "XAF",
  nameFr: "Franc CFA (BEAC)",
  nameEn: "CFA franc",
  symbol: "FCFA",
  decimalDigits: 0,
};
const NGN = {
  isoCode: "NGN",
  nameFr: "Naira nigérian",
  nameEn: "Nigerian naira",
  symbol: "₦",
  decimalDigits: 2,
};
const CEMAC = { code: "CEMAC", nameFr: "Zone CEMAC (franc CFA BEAC)", nameEn: "CEMAC zone" };

const country = (
  isoCode: string,
  isoAlpha3: string,
  nameFr: string,
  region: string,
  currency: typeof XAF,
  zone: typeof CEMAC | null,
) => ({
  isoCode,
  isoAlpha3,
  nameFr,
  nameEn: nameFr,
  phoneCallingCode: "+000",
  region,
  currency,
  monetaryZone: zone,
});

const plan = (code: string, category: string, maxStudents: number | null) => ({
  code,
  category,
  nameFr: code,
  nameEn: code,
  trialDays: 30,
  maxStudents,
  maxUsers: null,
  maxCampuses: null,
  childrenCovered: null,
});

const price = (planCode: string, currencyIsoCode: string, amountCents: number) => ({
  planCode,
  currencyIsoCode,
  countryIsoCode: null,
  billingPeriod: "MONTHLY",
  amountCents,
});

beforeAll(async () => {
  await i18n.changeLanguage("fr");
  api.listPublicCountriesOrSnapshot.mockResolvedValue([
    country("CM", "CMR", "Cameroun", "CENTRAL_AFRICA", XAF, CEMAC),
    country("TD", "TCD", "Tchad", "CENTRAL_AFRICA", XAF, CEMAC),
    country("NG", "NGA", "Nigeria", "WEST_AFRICA", NGN, null),
  ]);
  api.getPublicPricingOrSnapshot.mockResolvedValue({
    exchangeRateDate: "2026-10-21",
    plans: [
      plan("SCHOOL_ESSENTIAL", "SCHOOL", 300),
      plan("SCHOOL_PROFESSIONAL", "SCHOOL", 1000),
      plan("SCHOOL_PREMIUM", "SCHOOL", 3000),
      plan("SCHOOL_ENTERPRISE", "SCHOOL", null),
      plan("PARENT_BASIC", "PARENT", null),
      plan("FAMILY_PLAN", "PARENT", null),
    ],
    prices: [
      price("SCHOOL_ESSENTIAL", "XAF", 25_000),
      price("SCHOOL_PROFESSIONAL", "XAF", 65_000),
      price("SCHOOL_ESSENTIAL", "NGN", 5_700_000),
      price("SCHOOL_PROFESSIONAL", "NGN", 15_000_000),
      price("PARENT_BASIC", "XAF", 1_000),
      price("FAMILY_PLAN", "XAF", 4_000),
    ],
  });
});

afterEach(() => {
  cleanup();
});

function renderPage(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <PricingPage />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

const normalize = (text: string | null): string => (text ?? "").replace(/\s/g, " ");

describe("PricingPage — simulateur", () => {
  it("conseille une formule et affiche son prix dans la monnaie du pays choisi", async () => {
    renderPage();

    const monthly = await screen.findByTestId("simulator-monthly");
    expect(normalize(monthly.textContent)).toContain("25 000 FCFA");
    expect(screen.getByText(/même tarif dans 2 pays/)).toBeInTheDocument();
    // 25 000 FCFA × 10 mois (année scolaire, durée par défaut).
    expect(normalize(screen.getByText(/Total pour 10 mois/).textContent)).toContain("250 000 FCFA");

    fireEvent.change(screen.getByLabelText("Nombre d'élèves"), { target: { value: "600" } });
    expect(normalize(screen.getByTestId("simulator-monthly").textContent)).toContain("65 000 FCFA");

    fireEvent.change(screen.getByLabelText("Pays"), { target: { value: "NG" } });
    expect(normalize(screen.getByTestId("simulator-monthly").textContent)).toContain("150 000 ₦");
    expect(screen.getByText("NG · NGA · +000")).toBeInTheDocument();
  });

  it("renvoie vers un devis au-delà de 3 000 élèves", async () => {
    renderPage();
    await screen.findByTestId("simulator-monthly");

    fireEvent.change(screen.getByLabelText("Nombre d'élèves"), { target: { value: "5000" } });
    const simulator = screen.getByRole("region", { name: "Simulez le coût pour votre établissement" });
    expect(within(simulator).getByText("Formule sur devis — contactez-nous")).toBeInTheDocument();
  });
});
