import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import { AppLayout } from "./layouts/AppLayout.js";
import { MarketingLayout } from "./layouts/MarketingLayout.js";
import { ConfigurationPage } from "./pages/app/ConfigurationPage.js";
import { DashboardPage } from "./pages/app/DashboardPage.js";
import { LoginPage } from "./pages/app/LoginPage.js";
import { StudentDetailPage } from "./pages/app/StudentDetailPage.js";
import { StudentsPage } from "./pages/app/StudentsPage.js";
import { UsersPage } from "./pages/app/UsersPage.js";
import { ContactPage } from "./pages/marketing/ContactPage.js";
import { HomePage } from "./pages/marketing/HomePage.js";
import { PricingPage } from "./pages/marketing/PricingPage.js";
import { PrivacyPage } from "./pages/marketing/PrivacyPage.js";
import { RefundPolicyPage } from "./pages/marketing/RefundPolicyPage.js";
import { SignupPage } from "./pages/marketing/SignupPage.js";
import { TermsPage } from "./pages/marketing/TermsPage.js";

const queryClient = new QueryClient();

export function App(): ReactNode {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<MarketingLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/tarifs" element={<PricingPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/inscription" element={<SignupPage />} />
            <Route path="/connexion" element={<LoginPage />} />
            <Route path="/conditions-generales" element={<TermsPage />} />
            <Route path="/confidentialite" element={<PrivacyPage />} />
            <Route path="/remboursement" element={<RefundPolicyPage />} />
          </Route>

          <Route element={<AppLayout />}>
            <Route path="/tableau-de-bord" element={<DashboardPage />} />
            <Route path="/configuration" element={<ConfigurationPage />} />
            <Route path="/eleves" element={<StudentsPage />} />
            <Route path="/eleves/:id" element={<StudentDetailPage />} />
            <Route path="/utilisateurs" element={<UsersPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
