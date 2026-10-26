import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { PwaStatus } from "./components/PwaStatus.js";
import { AdminLayout } from "./layouts/AdminLayout.js";
import { AppLayout } from "./layouts/AppLayout.js";
import { MarketingLayout } from "./layouts/MarketingLayout.js";
import { PortalLayout } from "./layouts/PortalLayout.js";
import { ApiError } from "./lib/apiClient.js";
import { lazyImport } from "./lib/lazyImport.js";
import { LoginPage } from "./pages/app/LoginPage.js";
import { ContactPage } from "./pages/marketing/ContactPage.js";
import { HomePage } from "./pages/marketing/HomePage.js";
import { PricingPage } from "./pages/marketing/PricingPage.js";
import { PrivacyPage } from "./pages/marketing/PrivacyPage.js";
import { RefundPolicyPage } from "./pages/marketing/RefundPolicyPage.js";
import { SignupPage } from "./pages/marketing/SignupPage.js";
import { TermsPage } from "./pages/marketing/TermsPage.js";

// Chargées à la demande (React.lazy) : un visiteur du site marketing (ci-dessus,
// bundle initial) ne doit pas télécharger tout l'espace établissement/portail/admin
// qu'il ne verra jamais — c'était jusqu'ici un seul bundle pour l'ensemble du site.
const AdminAuditLogsPage = lazyImport(
  () => import("./pages/admin/AdminAuditLogsPage.js"),
  "AdminAuditLogsPage",
);
const AdminDashboardPage = lazyImport(
  () => import("./pages/admin/AdminDashboardPage.js"),
  "AdminDashboardPage",
);
const AdminGuidePage = lazyImport(() => import("./pages/admin/AdminGuidePage.js"), "AdminGuidePage");
const AdminLoginPage = lazyImport(() => import("./pages/admin/AdminLoginPage.js"), "AdminLoginPage");
const AdminMessageTemplatesPage = lazyImport(
  () => import("./pages/admin/AdminMessageTemplatesPage.js"),
  "AdminMessageTemplatesPage",
);
const AdminPlatformSettingsPage = lazyImport(
  () => import("./pages/admin/AdminPlatformSettingsPage.js"),
  "AdminPlatformSettingsPage",
);
const AdminPromotionCodesPage = lazyImport(
  () => import("./pages/admin/AdminPromotionCodesPage.js"),
  "AdminPromotionCodesPage",
);
const AdminReferenceDataPage = lazyImport(
  () => import("./pages/admin/AdminReferenceDataPage.js"),
  "AdminReferenceDataPage",
);
const AdminSponsorsPage = lazyImport(() => import("./pages/admin/AdminSponsorsPage.js"), "AdminSponsorsPage");
const AdminSubscriptionsPage = lazyImport(
  () => import("./pages/admin/AdminSubscriptionsPage.js"),
  "AdminSubscriptionsPage",
);
const AdminSupportTicketsPage = lazyImport(
  () => import("./pages/admin/AdminSupportTicketsPage.js"),
  "AdminSupportTicketsPage",
);
const AdminTenantsPage = lazyImport(() => import("./pages/admin/AdminTenantsPage.js"), "AdminTenantsPage");
const AnnouncementsPage = lazyImport(() => import("./pages/app/AnnouncementsPage.js"), "AnnouncementsPage");
const AttendancePage = lazyImport(() => import("./pages/app/AttendancePage.js"), "AttendancePage");
const BoardingPage = lazyImport(() => import("./pages/app/BoardingPage.js"), "BoardingPage");
const CafeteriaPage = lazyImport(() => import("./pages/app/CafeteriaPage.js"), "CafeteriaPage");
const ConfigurationPage = lazyImport(() => import("./pages/app/ConfigurationPage.js"), "ConfigurationPage");
const TeacherDashboardPage = lazyImport(
  () => import("./pages/app/TeacherDashboardPage.js"),
  "TeacherDashboardPage",
);
const DashboardPage = lazyImport(() => import("./pages/app/DashboardPage.js"), "DashboardPage");
const DisciplinePage = lazyImport(() => import("./pages/app/DisciplinePage.js"), "DisciplinePage");
const ElearningPage = lazyImport(() => import("./pages/app/ElearningPage.js"), "ElearningPage");
const EmployeeDetailPage = lazyImport(
  () => import("./pages/app/EmployeeDetailPage.js"),
  "EmployeeDetailPage",
);
const EmployeesPage = lazyImport(() => import("./pages/app/EmployeesPage.js"), "EmployeesPage");
const FinancePage = lazyImport(() => import("./pages/app/FinancePage.js"), "FinancePage");
const GradingPage = lazyImport(() => import("./pages/app/GradingPage.js"), "GradingPage");
const GuidePage = lazyImport(() => import("./pages/marketing/GuidePage.js"), "GuidePage");
const HelpPage = lazyImport(() => import("./pages/app/HelpPage.js"), "HelpPage");
const HomeworkPage = lazyImport(() => import("./pages/app/HomeworkPage.js"), "HomeworkPage");
const LibraryPage = lazyImport(() => import("./pages/app/LibraryPage.js"), "LibraryPage");
const ReportCardsPage = lazyImport(() => import("./pages/app/ReportCardsPage.js"), "ReportCardsPage");
const StudentDetailPage = lazyImport(() => import("./pages/app/StudentDetailPage.js"), "StudentDetailPage");
const SubscriptionPage = lazyImport(() => import("./pages/app/SubscriptionPage.js"), "SubscriptionPage");
const StudentsPage = lazyImport(() => import("./pages/app/StudentsPage.js"), "StudentsPage");
const GuardiansPage = lazyImport(() => import("./pages/app/GuardiansPage.js"), "GuardiansPage");
const ParentProfilePage = lazyImport(
  () => import("./pages/portal/ParentProfilePage.js"),
  "ParentProfilePage",
);
const ParentSubscriptionsPage = lazyImport(
  () => import("./pages/portal/ParentSubscriptionsPage.js"),
  "ParentSubscriptionsPage",
);
const RegistrationsPage = lazyImport(() => import("./pages/app/RegistrationsPage.js"), "RegistrationsPage");
const SupportTicketsPage = lazyImport(
  () => import("./pages/app/SupportTicketsPage.js"),
  "SupportTicketsPage",
);
const TimetablePage = lazyImport(() => import("./pages/app/TimetablePage.js"), "TimetablePage");
const TransportPage = lazyImport(() => import("./pages/app/TransportPage.js"), "TransportPage");
const AdminUsersPage = lazyImport(() => import("./pages/admin/AdminUsersPage.js"), "AdminUsersPage");
const ParentChildPage = lazyImport(() => import("./pages/portal/ParentChildPage.js"), "ParentChildPage");
const ParentDashboardPage = lazyImport(
  () => import("./pages/portal/ParentDashboardPage.js"),
  "ParentDashboardPage",
);
const PortalLoginPage = lazyImport(() => import("./pages/portal/PortalLoginPage.js"), "PortalLoginPage");
const PortalRedeemPage = lazyImport(() => import("./pages/portal/PortalRedeemPage.js"), "PortalRedeemPage");
const StudentProfilePage = lazyImport(
  () => import("./pages/portal/StudentProfilePage.js"),
  "StudentProfilePage",
);
const StudentPortalPage = lazyImport(
  () => import("./pages/portal/StudentPortalPage.js"),
  "StudentPortalPage",
);

// Une erreur 4xx (pas d'abonnement, droits insuffisants, ressource absente…) ne
// changera pas en relançant : la configuration par défaut de React Query la
// retentait 3 fois avec un délai croissant, d'où de longues attentes avant
// d'afficher l'erreur (tableau de bord sans abonnement actif). Seules les erreurs
// réseau/serveur sont retentées, une fois.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) =>
        !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 1,
    },
  },
});

function RouteFallback(): ReactNode {
  const { t } = useTranslation();
  return <p className="px-6 py-10 text-sm text-slate-500">{t("state.loading")}</p>;
}

export function App(): ReactNode {
  return (
    <QueryClientProvider client={queryClient}>
      <PwaStatus />
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route element={<MarketingLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/tarifs" element={<PricingPage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/guide" element={<GuidePage />} />
              <Route path="/inscription" element={<SignupPage />} />
              <Route path="/connexion" element={<LoginPage />} />
              <Route path="/conditions-generales" element={<TermsPage />} />
              <Route path="/confidentialite" element={<PrivacyPage />} />
              <Route path="/remboursement" element={<RefundPolicyPage />} />
            </Route>

            <Route element={<AppLayout />}>
              <Route path="/tableau-de-bord" element={<DashboardPage />} />
              <Route path="/enseignant" element={<TeacherDashboardPage />} />
              <Route path="/configuration" element={<ConfigurationPage />} />
              <Route path="/abonnement" element={<SubscriptionPage />} />
              <Route path="/eleves" element={<StudentsPage />} />
              <Route path="/parents" element={<GuardiansPage />} />
              <Route path="/inscriptions" element={<RegistrationsPage />} />
              <Route path="/eleves/:id" element={<StudentDetailPage />} />
              <Route path="/utilisateurs" element={<Navigate to="/tableau-de-bord" replace />} />
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
              <Route path="/bibliotheque" element={<LibraryPage />} />
              <Route path="/transport" element={<TransportPage />} />
              <Route path="/cantine" element={<CafeteriaPage />} />
              <Route path="/internat" element={<BoardingPage />} />
              <Route path="/e-learning" element={<ElearningPage />} />
              <Route path="/aide" element={<HelpPage />} />
            </Route>

            <Route element={<PortalLayout />}>
              <Route path="/portail/parent" element={<ParentDashboardPage />} />
              <Route path="/portail/profil" element={<ParentProfilePage />} />
              <Route path="/portail/abonnements" element={<ParentSubscriptionsPage />} />
              <Route path="/portail/parent/enfants/:studentId" element={<ParentChildPage />} />
              <Route path="/portail/eleve" element={<StudentPortalPage />} />
              <Route path="/portail/eleve/profil" element={<StudentProfilePage />} />
              <Route path="/portail/activation" element={<PortalRedeemPage />} />
              <Route path="/portail/aide" element={<HelpPage />} />
            </Route>
            <Route path="/portail/connexion" element={<PortalLoginPage />} />

            <Route path="/admin/connexion" element={<AdminLoginPage />} />
            <Route element={<AdminLayout />}>
              <Route path="/admin" element={<AdminDashboardPage />} />
              <Route path="/admin/utilisateurs" element={<AdminUsersPage />} />
              <Route path="/admin/etablissements" element={<AdminTenantsPage />} />
              <Route path="/admin/abonnements" element={<AdminSubscriptionsPage />} />
              <Route path="/admin/journaux-audit" element={<AdminAuditLogsPage />} />
              <Route path="/admin/donnees-reference" element={<AdminReferenceDataPage />} />
              <Route path="/admin/codes-promo" element={<AdminPromotionCodesPage />} />
              <Route path="/admin/support" element={<AdminSupportTicketsPage />} />
              <Route path="/admin/modeles-messages" element={<AdminMessageTemplatesPage />} />
              <Route path="/admin/sponsors" element={<AdminSponsorsPage />} />
              <Route path="/admin/parametres" element={<AdminPlatformSettingsPage />} />
              <Route path="/admin/guide" element={<AdminGuidePage />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
