import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import { AdminLayout } from "./layouts/AdminLayout.js";
import { AppLayout } from "./layouts/AppLayout.js";
import { MarketingLayout } from "./layouts/MarketingLayout.js";
import { PortalLayout } from "./layouts/PortalLayout.js";
import { AdminAuditLogsPage } from "./pages/admin/AdminAuditLogsPage.js";
import { AdminDashboardPage } from "./pages/admin/AdminDashboardPage.js";
import { AdminLoginPage } from "./pages/admin/AdminLoginPage.js";
import { AdminMessageTemplatesPage } from "./pages/admin/AdminMessageTemplatesPage.js";
import { AdminPlatformSettingsPage } from "./pages/admin/AdminPlatformSettingsPage.js";
import { AdminPromotionCodesPage } from "./pages/admin/AdminPromotionCodesPage.js";
import { AdminReferenceDataPage } from "./pages/admin/AdminReferenceDataPage.js";
import { AdminSponsorsPage } from "./pages/admin/AdminSponsorsPage.js";
import { AdminSubscriptionsPage } from "./pages/admin/AdminSubscriptionsPage.js";
import { AdminSupportTicketsPage } from "./pages/admin/AdminSupportTicketsPage.js";
import { AdminTenantsPage } from "./pages/admin/AdminTenantsPage.js";
import { AnnouncementsPage } from "./pages/app/AnnouncementsPage.js";
import { AttendancePage } from "./pages/app/AttendancePage.js";
import { ConfigurationPage } from "./pages/app/ConfigurationPage.js";
import { DashboardPage } from "./pages/app/DashboardPage.js";
import { DisciplinePage } from "./pages/app/DisciplinePage.js";
import { EmployeeDetailPage } from "./pages/app/EmployeeDetailPage.js";
import { EmployeesPage } from "./pages/app/EmployeesPage.js";
import { FinancePage } from "./pages/app/FinancePage.js";
import { GradingPage } from "./pages/app/GradingPage.js";
import { HomeworkPage } from "./pages/app/HomeworkPage.js";
import { LoginPage } from "./pages/app/LoginPage.js";
import { ReportCardsPage } from "./pages/app/ReportCardsPage.js";
import { StudentDetailPage } from "./pages/app/StudentDetailPage.js";
import { StudentsPage } from "./pages/app/StudentsPage.js";
import { SupportTicketsPage } from "./pages/app/SupportTicketsPage.js";
import { TimetablePage } from "./pages/app/TimetablePage.js";
import { UsersPage } from "./pages/app/UsersPage.js";
import { ContactPage } from "./pages/marketing/ContactPage.js";
import { HomePage } from "./pages/marketing/HomePage.js";
import { PricingPage } from "./pages/marketing/PricingPage.js";
import { PrivacyPage } from "./pages/marketing/PrivacyPage.js";
import { RefundPolicyPage } from "./pages/marketing/RefundPolicyPage.js";
import { SignupPage } from "./pages/marketing/SignupPage.js";
import { TermsPage } from "./pages/marketing/TermsPage.js";
import { ParentChildPage } from "./pages/portal/ParentChildPage.js";
import { ParentDashboardPage } from "./pages/portal/ParentDashboardPage.js";
import { PortalLoginPage } from "./pages/portal/PortalLoginPage.js";
import { PortalRedeemPage } from "./pages/portal/PortalRedeemPage.js";
import { StudentPortalPage } from "./pages/portal/StudentPortalPage.js";

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
            <Route path="/personnel" element={<EmployeesPage />} />
            <Route path="/personnel/:id" element={<EmployeeDetailPage />} />
            <Route path="/discipline" element={<DisciplinePage />} />
            <Route path="/presences" element={<AttendancePage />} />
            <Route path="/emplois-du-temps" element={<TimetablePage />} />
            <Route path="/notes" element={<GradingPage />} />
            <Route path="/bulletins" element={<ReportCardsPage />} />
            <Route path="/finances" element={<FinancePage />} />
            <Route path="/devoirs" element={<HomeworkPage />} />
            <Route path="/annonces" element={<AnnouncementsPage />} />
            <Route path="/support" element={<SupportTicketsPage />} />
          </Route>

          <Route element={<PortalLayout />}>
            <Route path="/portail/parent" element={<ParentDashboardPage />} />
            <Route path="/portail/parent/enfants/:studentId" element={<ParentChildPage />} />
            <Route path="/portail/eleve" element={<StudentPortalPage />} />
            <Route path="/portail/activation" element={<PortalRedeemPage />} />
          </Route>
          <Route path="/portail/connexion" element={<PortalLoginPage />} />

          <Route path="/admin/connexion" element={<AdminLoginPage />} />
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<AdminDashboardPage />} />
            <Route path="/admin/etablissements" element={<AdminTenantsPage />} />
            <Route path="/admin/abonnements" element={<AdminSubscriptionsPage />} />
            <Route path="/admin/journaux-audit" element={<AdminAuditLogsPage />} />
            <Route path="/admin/donnees-reference" element={<AdminReferenceDataPage />} />
            <Route path="/admin/codes-promo" element={<AdminPromotionCodesPage />} />
            <Route path="/admin/support" element={<AdminSupportTicketsPage />} />
            <Route path="/admin/modeles-messages" element={<AdminMessageTemplatesPage />} />
            <Route path="/admin/sponsors" element={<AdminSponsorsPage />} />
            <Route path="/admin/parametres" element={<AdminPlatformSettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
