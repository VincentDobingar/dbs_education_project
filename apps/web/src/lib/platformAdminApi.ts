// §31 : client de la super-administration (/api/v1/platform/...), toujours gardé
// côté serveur par requirePlatformRole (jamais enforceTenantScope) — voir
// platform-admin.routes.ts. Aucun subdomain ici par construction : une action
// cross-tenant par nature, jamais rattachée à un tenant précis côté requête.
import { apiRequest } from "./apiClient.js";

export interface AdminCredentials {
  accessToken: string;
}

// ---------------------------------------------------------------------------
// Établissements (tenants) + élévations temporaires
// ---------------------------------------------------------------------------

export type TenantStatus =
  | "DRAFT"
  | "PENDING_VERIFICATION"
  | "VERIFIED"
  | "TRIAL"
  | "ACTIVE"
  | "SUSPENDED"
  | "EXPIRED"
  | "REJECTED"
  | "CANCELLED";

export interface PlatformTenant {
  id: string;
  name: string;
  legalName: string | null;
  ownershipType: "PUBLIC" | "PRIVATE";
  countryId: string;
  currencyId: string;
  region: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  status: TenantStatus;
  verifiedAt: string | null;
  suspendedAt: string | null;
  suspendedReason: string | null;
  createdAt: string;
}

export function listPlatformTenants(
  query: { status?: TenantStatus; search?: string },
  creds: AdminCredentials,
): Promise<PlatformTenant[]> {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.search) params.set("search", query.search);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`/platform/tenants${suffix}`, { ...creds });
}

export function getPlatformTenant(id: string, creds: AdminCredentials): Promise<PlatformTenant> {
  return apiRequest(`/platform/tenants/${id}`, { ...creds });
}

function justifiedPost(
  path: string,
  justification: string,
  creds: AdminCredentials,
): Promise<PlatformTenant> {
  return apiRequest(path, { method: "POST", body: { justification }, ...creds });
}

export function verifyTenant(
  id: string,
  justification: string,
  creds: AdminCredentials,
): Promise<PlatformTenant> {
  return justifiedPost(`/platform/tenants/${id}/verify`, justification, creds);
}

export function rejectTenant(
  id: string,
  justification: string,
  creds: AdminCredentials,
): Promise<PlatformTenant> {
  return justifiedPost(`/platform/tenants/${id}/reject`, justification, creds);
}

export function suspendTenant(
  id: string,
  justification: string,
  creds: AdminCredentials,
): Promise<PlatformTenant> {
  return justifiedPost(`/platform/tenants/${id}/suspend`, justification, creds);
}

export function reactivateTenant(
  id: string,
  justification: string,
  creds: AdminCredentials,
): Promise<PlatformTenant> {
  return justifiedPost(`/platform/tenants/${id}/reactivate`, justification, creds);
}

export const MAX_ELEVATION_HOURS = 72;

export interface TenantElevation {
  id: string;
  userId: string;
  roleId: string;
  tenantId: string;
  expiresAt: string | null;
  justification: string | null;
  grantedAt: string;
  grantedById: string | null;
}

export function listTenantElevations(tenantId: string, creds: AdminCredentials): Promise<TenantElevation[]> {
  return apiRequest(`/platform/tenants/${tenantId}/elevations`, { ...creds });
}

export function elevateInTenant(
  tenantId: string,
  input: { roleCode: string; durationHours: number; justification: string },
  creds: AdminCredentials,
): Promise<TenantElevation> {
  return apiRequest(`/platform/tenants/${tenantId}/elevate`, { method: "POST", body: input, ...creds });
}

export function revokeElevation(
  tenantId: string,
  userRoleId: string,
  justification: string,
  creds: AdminCredentials,
): Promise<void> {
  return apiRequest(`/platform/tenants/${tenantId}/elevations/${userRoleId}/revoke`, {
    method: "POST",
    body: { justification },
    ...creds,
  });
}

// ---------------------------------------------------------------------------
// Journaux d'audit
// ---------------------------------------------------------------------------

export interface AuditLogEntry {
  id: string;
  tenantId: string | null;
  actorUserId: string | null;
  actorRoleCode: string | null;
  action: string;
  entityType: string;
  entityId: string;
  beforeData: unknown;
  afterData: unknown;
  justification: string | null;
  ipAddress: string | null;
  createdAt: string;
}

export function listAuditLogs(
  query: { tenantId?: string; entityType?: string; actorUserId?: string },
  creds: AdminCredentials,
): Promise<AuditLogEntry[]> {
  const params = new URLSearchParams();
  if (query.tenantId) params.set("tenantId", query.tenantId);
  if (query.entityType) params.set("entityType", query.entityType);
  if (query.actorUserId) params.set("actorUserId", query.actorUserId);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`/platform/audit-logs${suffix}`, { ...creds });
}

// ---------------------------------------------------------------------------
// Abonnements
// ---------------------------------------------------------------------------

export type SubscriptionStatus =
  | "DRAFT"
  | "PENDING_PAYMENT"
  | "PENDING_ACTIVATION"
  | "TRIAL"
  | "ACTIVE"
  | "PAST_DUE"
  | "GRACE_PERIOD"
  | "SUSPENDED"
  | "EXPIRED"
  | "CANCELLED"
  | "REFUNDED";

export type SubscriberCategory = "SCHOOL" | "PARENT" | "STUDENT" | "ORGANIZATION";

export interface PlatformSubscription {
  id: string;
  status: SubscriptionStatus;
  startsAt: string | null;
  endsAt: string | null;
  trialEndsAt: string | null;
  autoRenew: boolean;
  createdAt: string;
  plan: { id: string; code: string; nameFr: string; nameEn: string };
  owner: {
    ownerType: SubscriberCategory;
    tenant: { id: string; name: string } | null;
    student: { id: string; firstName: string; lastName: string } | null;
    organization: { id: string; name: string } | null;
  };
  events?: { id: string; fromStatus: string | null; toStatus: string; createdAt: string }[];
}

export function listPlatformSubscriptions(
  query: { status?: SubscriptionStatus; ownerType?: SubscriberCategory },
  creds: AdminCredentials,
): Promise<PlatformSubscription[]> {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.ownerType) params.set("ownerType", query.ownerType);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`/platform/subscriptions${suffix}`, { ...creds });
}

export function getPlatformSubscription(id: string, creds: AdminCredentials): Promise<PlatformSubscription> {
  return apiRequest(`/platform/subscriptions/${id}`, { ...creds });
}

export function forceTransition(
  id: string,
  toStatus: SubscriptionStatus,
  justification: string,
  creds: AdminCredentials,
): Promise<PlatformSubscription> {
  return apiRequest(`/platform/subscriptions/${id}/transition`, {
    method: "POST",
    body: { toStatus, justification },
    ...creds,
  });
}

export function extendTrial(
  id: string,
  trialEndsAt: string,
  justification: string,
  creds: AdminCredentials,
): Promise<PlatformSubscription> {
  return apiRequest(`/platform/subscriptions/${id}/extend-trial`, {
    method: "POST",
    body: { trialEndsAt, justification },
    ...creds,
  });
}

export function sweepExpiredSubscriptions(creds: AdminCredentials): Promise<{ swept: number }> {
  return apiRequest("/platform/subscriptions/sweep-expired", { method: "POST", ...creds });
}

// ---------------------------------------------------------------------------
// Données de référence : pays, devises, moyens de paiement
// ---------------------------------------------------------------------------

export interface Country {
  id: string;
  isoCode: string;
  nameFr: string;
  nameEn: string;
  phoneCallingCode: string;
  defaultCurrencyId: string | null;
  isActive: boolean;
}

export interface Currency {
  id: string;
  isoCode: string;
  nameFr: string;
  nameEn: string;
  symbol: string;
  decimalDigits: number;
  isActive: boolean;
}

export type PaymentMethodType =
  "CASH" | "BANK_TRANSFER" | "CARD" | "MOBILE_MONEY" | "WALLET" | "PREPAID_CODE" | "SPONSOR";

export interface PaymentProvider {
  id: string;
  code: string;
  nameFr: string;
  nameEn: string;
  countryId: string | null;
  methodType: PaymentMethodType;
  isTestMode: boolean;
  isActive: boolean;
  config: Record<string, unknown> | null;
}

export function listCountries(creds: AdminCredentials): Promise<Country[]> {
  return apiRequest("/platform/countries", { ...creds });
}

export function createCountry(
  input: {
    isoCode: string;
    nameFr: string;
    nameEn: string;
    phoneCallingCode: string;
    defaultCurrencyId?: string;
  },
  creds: AdminCredentials,
): Promise<Country> {
  return apiRequest("/platform/countries", { method: "POST", body: input, ...creds });
}

export function updateCountry(
  id: string,
  input: Partial<{
    nameFr: string;
    nameEn: string;
    phoneCallingCode: string;
    defaultCurrencyId: string;
    isActive: boolean;
  }>,
  creds: AdminCredentials,
): Promise<Country> {
  return apiRequest(`/platform/countries/${id}`, { method: "PATCH", body: input, ...creds });
}

export function listCurrencies(creds: AdminCredentials): Promise<Currency[]> {
  return apiRequest("/platform/currencies", { ...creds });
}

export function createCurrency(
  input: { isoCode: string; nameFr: string; nameEn: string; symbol: string; decimalDigits?: number },
  creds: AdminCredentials,
): Promise<Currency> {
  return apiRequest("/platform/currencies", { method: "POST", body: input, ...creds });
}

export function updateCurrency(
  id: string,
  input: Partial<{
    nameFr: string;
    nameEn: string;
    symbol: string;
    decimalDigits: number;
    isActive: boolean;
  }>,
  creds: AdminCredentials,
): Promise<Currency> {
  return apiRequest(`/platform/currencies/${id}`, { method: "PATCH", body: input, ...creds });
}

export function listPaymentProviders(creds: AdminCredentials): Promise<PaymentProvider[]> {
  return apiRequest("/platform/payment-providers", { ...creds });
}

export function createPaymentProvider(
  input: {
    code: string;
    nameFr: string;
    nameEn: string;
    countryId?: string;
    methodType: PaymentMethodType;
    isTestMode?: boolean;
  },
  creds: AdminCredentials,
): Promise<PaymentProvider> {
  return apiRequest("/platform/payment-providers", { method: "POST", body: input, ...creds });
}

export function updatePaymentProvider(
  id: string,
  input: Partial<{ nameFr: string; nameEn: string; isTestMode: boolean; isActive: boolean }>,
  creds: AdminCredentials,
): Promise<PaymentProvider> {
  return apiRequest(`/platform/payment-providers/${id}`, { method: "PATCH", body: input, ...creds });
}

// ---------------------------------------------------------------------------
// Codes promotionnels
// ---------------------------------------------------------------------------

export type PromotionDiscountType = "PERCENTAGE" | "FIXED_AMOUNT";

export interface PromotionCode {
  id: string;
  code: string;
  descriptionFr: string | null;
  descriptionEn: string | null;
  discountType: PromotionDiscountType;
  discountValue: string;
  applicableCategory: SubscriberCategory | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  createdAt: string;
}

export function listPromotionCodes(
  query: { isActive?: boolean },
  creds: AdminCredentials,
): Promise<PromotionCode[]> {
  const suffix = query.isActive !== undefined ? `?isActive=${String(query.isActive)}` : "";
  return apiRequest(`/platform/promotion-codes${suffix}`, { ...creds });
}

export function createPromotionCode(
  input: {
    code: string;
    descriptionFr?: string;
    descriptionEn?: string;
    discountType: PromotionDiscountType;
    discountValue: number;
    applicableCategory?: SubscriberCategory;
    maxRedemptions?: number;
    startsAt?: string;
    endsAt?: string;
  },
  creds: AdminCredentials,
): Promise<PromotionCode> {
  return apiRequest("/platform/promotion-codes", { method: "POST", body: input, ...creds });
}

export function updatePromotionCode(
  id: string,
  input: Partial<{
    descriptionFr: string;
    descriptionEn: string;
    discountType: PromotionDiscountType;
    discountValue: number;
    applicableCategory: SubscriberCategory;
    maxRedemptions: number;
    startsAt: string;
    endsAt: string;
    isActive: boolean;
  }>,
  creds: AdminCredentials,
): Promise<PromotionCode> {
  return apiRequest(`/platform/promotion-codes/${id}`, { method: "PATCH", body: input, ...creds });
}

// ---------------------------------------------------------------------------
// Tickets de support (triage super-admin)
// ---------------------------------------------------------------------------

export type SupportTicketStatus = "OPEN" | "IN_PROGRESS" | "WAITING_ON_USER" | "RESOLVED" | "CLOSED";
export type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface AdminSupportTicketMessage {
  id: string;
  ticketId: string;
  authorUserId: string;
  body: string;
  isInternalNote: boolean;
  createdAt: string;
}

export interface AdminSupportTicket {
  id: string;
  tenantId: string | null;
  createdByUserId: string;
  subject: string;
  category: string | null;
  status: SupportTicketStatus;
  priority: TicketPriority;
  assignedToUserId: string | null;
  closedAt: string | null;
  createdAt: string;
  messages?: AdminSupportTicketMessage[];
}

export function listAdminSupportTickets(
  query: {
    tenantId?: string;
    status?: SupportTicketStatus;
    priority?: TicketPriority;
    assignedToUserId?: string;
  },
  creds: AdminCredentials,
): Promise<AdminSupportTicket[]> {
  const params = new URLSearchParams();
  if (query.tenantId) params.set("tenantId", query.tenantId);
  if (query.status) params.set("status", query.status);
  if (query.priority) params.set("priority", query.priority);
  if (query.assignedToUserId) params.set("assignedToUserId", query.assignedToUserId);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`/platform/support-tickets${suffix}`, { ...creds });
}

export function getAdminSupportTicket(id: string, creds: AdminCredentials): Promise<AdminSupportTicket> {
  return apiRequest(`/platform/support-tickets/${id}`, { ...creds });
}

export function assignSupportTicket(
  id: string,
  assignedToUserId: string,
  creds: AdminCredentials,
): Promise<AdminSupportTicket> {
  return apiRequest(`/platform/support-tickets/${id}/assign`, {
    method: "POST",
    body: { assignedToUserId },
    ...creds,
  });
}

export function updateSupportTicketStatus(
  id: string,
  status: SupportTicketStatus,
  creds: AdminCredentials,
): Promise<AdminSupportTicket> {
  return apiRequest(`/platform/support-tickets/${id}/status`, {
    method: "PATCH",
    body: { status },
    ...creds,
  });
}

export function addAdminSupportTicketMessage(
  id: string,
  body: string,
  isInternalNote: boolean,
  creds: AdminCredentials,
): Promise<AdminSupportTicketMessage> {
  return apiRequest(`/platform/support-tickets/${id}/messages`, {
    method: "POST",
    body: { body, isInternalNote },
    ...creds,
  });
}

// ---------------------------------------------------------------------------
// Modèles de notification
// ---------------------------------------------------------------------------

export type NotificationChannel = "EMAIL" | "SMS" | "PUSH" | "IN_APP";

export interface MessageTemplate {
  id: string;
  tenantId: string | null;
  code: string;
  channel: NotificationChannel;
  subject: string | null;
  bodyFr: string;
  bodyEn: string;
  createdAt: string;
}

export function listMessageTemplates(
  query: { tenantId?: string; channel?: NotificationChannel },
  creds: AdminCredentials,
): Promise<MessageTemplate[]> {
  const params = new URLSearchParams();
  if (query.tenantId) params.set("tenantId", query.tenantId);
  if (query.channel) params.set("channel", query.channel);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`/platform/message-templates${suffix}`, { ...creds });
}

export function createMessageTemplate(
  input: {
    tenantId?: string;
    code: string;
    channel: NotificationChannel;
    subject?: string;
    bodyFr: string;
    bodyEn: string;
  },
  creds: AdminCredentials,
): Promise<MessageTemplate> {
  return apiRequest("/platform/message-templates", { method: "POST", body: input, ...creds });
}

export function updateMessageTemplate(
  id: string,
  input: Partial<{ subject: string; bodyFr: string; bodyEn: string }>,
  creds: AdminCredentials,
): Promise<MessageTemplate> {
  return apiRequest(`/platform/message-templates/${id}`, { method: "PATCH", body: input, ...creds });
}

export function deleteMessageTemplate(id: string, creds: AdminCredentials): Promise<void> {
  return apiRequest(`/platform/message-templates/${id}`, { method: "DELETE", body: {}, ...creds });
}

// ---------------------------------------------------------------------------
// Organisations sponsors + licences sponsorisées
// ---------------------------------------------------------------------------

export type OrganizationType = "NGO" | "COMPANY" | "GOVERNMENT" | "OTHER";

export interface SponsorOrganization {
  id: string;
  name: string;
  type: OrganizationType;
  countryId: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  createdAt: string;
}

export function listOrganizations(
  query: { type?: OrganizationType },
  creds: AdminCredentials,
): Promise<SponsorOrganization[]> {
  const suffix = query.type ? `?type=${query.type}` : "";
  return apiRequest(`/platform/organizations${suffix}`, { ...creds });
}

export function createOrganization(
  input: {
    name: string;
    type: OrganizationType;
    countryId?: string;
    contactEmail?: string;
    contactPhone?: string;
  },
  creds: AdminCredentials,
): Promise<SponsorOrganization> {
  return apiRequest("/platform/organizations", { method: "POST", body: input, ...creds });
}

export function updateOrganization(
  id: string,
  input: Partial<{
    name: string;
    type: OrganizationType;
    countryId: string;
    contactEmail: string;
    contactPhone: string;
  }>,
  creds: AdminCredentials,
): Promise<SponsorOrganization> {
  return apiRequest(`/platform/organizations/${id}`, { method: "PATCH", body: input, ...creds });
}

export function deleteOrganization(id: string, creds: AdminCredentials): Promise<void> {
  return apiRequest(`/platform/organizations/${id}`, { method: "DELETE", body: {}, ...creds });
}

export type LicensePurchaserType = "TENANT" | "ORGANIZATION";
export type LicenseStatus = "AVAILABLE" | "ASSIGNED" | "REVOKED" | "EXPIRED";
export type LicenseBeneficiaryType = "PARENT" | "STUDENT";
export type BillingPeriod = "MONTHLY" | "QUARTERLY" | "ANNUAL";

export interface LicenseBatch {
  id: string;
  planId: string;
  purchaserType: LicensePurchaserType;
  sponsorTenantId: string | null;
  sponsorOrganizationId: string | null;
  quantity: number;
  unitPriceCents: number;
  currencyId: string;
  purchasedAt: string | null;
  createdAt: string;
  licenses?: SponsoredLicense[];
}

export interface SponsoredLicense {
  id: string;
  batchId: string | null;
  planId: string;
  fundingSource: string;
  sponsorTenantId: string | null;
  sponsorOrganizationId: string | null;
  status: LicenseStatus;
  validFrom: string | null;
  validUntil: string | null;
  createdAt: string;
  assignments?: { id: string; beneficiaryType: LicenseBeneficiaryType; subscriptionId: string }[];
}

export function listLicenseBatches(
  query: { sponsorTenantId?: string; sponsorOrganizationId?: string; planId?: string },
  creds: AdminCredentials,
): Promise<LicenseBatch[]> {
  const params = new URLSearchParams();
  if (query.sponsorTenantId) params.set("sponsorTenantId", query.sponsorTenantId);
  if (query.sponsorOrganizationId) params.set("sponsorOrganizationId", query.sponsorOrganizationId);
  if (query.planId) params.set("planId", query.planId);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`/platform/license-batches${suffix}`, { ...creds });
}

export function getLicenseBatch(id: string, creds: AdminCredentials): Promise<LicenseBatch> {
  return apiRequest(`/platform/license-batches/${id}`, { ...creds });
}

export function createLicenseBatch(
  input: {
    planId: string;
    purchaserType: LicensePurchaserType;
    sponsorTenantId?: string;
    sponsorOrganizationId?: string;
    quantity: number;
    unitPriceCents: number;
    currencyId: string;
    purchasedAt?: string;
  },
  creds: AdminCredentials,
): Promise<LicenseBatch> {
  return apiRequest("/platform/license-batches", { method: "POST", body: input, ...creds });
}

export function listLicenses(
  query: {
    batchId?: string;
    status?: LicenseStatus;
    sponsorTenantId?: string;
    sponsorOrganizationId?: string;
  },
  creds: AdminCredentials,
): Promise<SponsoredLicense[]> {
  const params = new URLSearchParams();
  if (query.batchId) params.set("batchId", query.batchId);
  if (query.status) params.set("status", query.status);
  if (query.sponsorTenantId) params.set("sponsorTenantId", query.sponsorTenantId);
  if (query.sponsorOrganizationId) params.set("sponsorOrganizationId", query.sponsorOrganizationId);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`/platform/licenses${suffix}`, { ...creds });
}

export function getLicense(id: string, creds: AdminCredentials): Promise<SponsoredLicense> {
  return apiRequest(`/platform/licenses/${id}`, { ...creds });
}

export function assignLicense(
  id: string,
  input: {
    beneficiaryType: LicenseBeneficiaryType;
    beneficiaryUserId?: string;
    beneficiaryStudentId?: string;
    tenantId?: string;
    billingPeriod?: BillingPeriod;
  },
  creds: AdminCredentials,
): Promise<SponsoredLicense> {
  return apiRequest(`/platform/licenses/${id}/assign`, { method: "POST", body: input, ...creds });
}

export function revokeLicense(
  id: string,
  reason: string,
  creds: AdminCredentials,
): Promise<SponsoredLicense> {
  return apiRequest(`/platform/licenses/${id}/revoke`, { method: "POST", body: { reason }, ...creds });
}

// ---------------------------------------------------------------------------
// Statistiques / indicateurs commerciaux
// ---------------------------------------------------------------------------

export interface StatsOverview {
  windowDays: number;
  tenants: { total: number; active: number; byStatus: Record<TenantStatus, number> };
  subscriptions: {
    total: number;
    byOwnerType: Record<SubscriberCategory, number>;
    byStatus: Record<SubscriptionStatus, number>;
    expiringWithinWindow: number;
  };
  licenses: { total: number; available: number; assigned: number; revoked: number; expired: number };
  revenue: {
    byCurrency: { currencyIsoCode: string; amountCents: number }[];
    annualByCurrency: { currencyIsoCode: string; amountCents: number }[];
    byOwnerType: { ownerType: SubscriberCategory; currencyIsoCode: string; amountCents: number }[];
    byPlan: { planCode: string; currencyIsoCode: string; amountCents: number }[];
    byCountry: { countryIsoCode: string; currencyIsoCode: string; amountCents: number }[];
  };
  conversionRate: number | null;
  churnRate: number | null;
  failedPayments: number;
}

export function getStatsOverview(
  windowDays: number | undefined,
  creds: AdminCredentials,
): Promise<StatsOverview> {
  const suffix = windowDays ? `?windowDays=${windowDays}` : "";
  return apiRequest(`/platform/stats/overview${suffix}`, { ...creds });
}

// ---------------------------------------------------------------------------
// Paramètres globaux
// ---------------------------------------------------------------------------

export interface PlatformSetting {
  id: string;
  key: string;
  value: unknown;
  updatedAt: string;
  updatedById: string | null;
}

export function listPlatformSettings(creds: AdminCredentials): Promise<PlatformSetting[]> {
  return apiRequest("/platform/platform-settings", { ...creds });
}

export function upsertPlatformSetting(
  key: string,
  value: unknown,
  creds: AdminCredentials,
): Promise<PlatformSetting> {
  return apiRequest(`/platform/platform-settings/${encodeURIComponent(key)}`, {
    method: "PUT",
    body: { value },
    ...creds,
  });
}

export function deletePlatformSetting(key: string, creds: AdminCredentials): Promise<void> {
  return apiRequest(`/platform/platform-settings/${encodeURIComponent(key)}`, {
    method: "DELETE",
    body: {},
    ...creds,
  });
}
