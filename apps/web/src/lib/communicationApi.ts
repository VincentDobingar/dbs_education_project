import { apiRequest, type TenantCredentials } from "./apiClient.js";

export interface Notification {
  id: string;
  channel: "IN_APP" | "EMAIL" | "SMS" | "PUSH";
  type: string;
  title: string | null;
  body: string;
  status: "QUEUED" | "SENT" | "FAILED" | "READ";
  sentAt: string | null;
  readAt: string | null;
  createdAt: string;
}

// User-scoped, no tenant context — usable by staff and portal beneficiaries alike.
export function listNotifications(accessToken: string, unreadOnly = false): Promise<Notification[]> {
  const suffix = unreadOnly ? "?unreadOnly=true" : "";
  return apiRequest(`/communication/notifications${suffix}`, { accessToken });
}

export function markNotificationRead(id: string, accessToken: string): Promise<Notification> {
  return apiRequest(`/communication/notifications/${id}/read`, { method: "PATCH", accessToken });
}

export interface NotificationPreference {
  id: string;
  channel: "EMAIL";
  category: string;
  isEnabled: boolean;
}

export function listNotificationPreferences(accessToken: string): Promise<NotificationPreference[]> {
  return apiRequest("/communication/notification-preferences", { accessToken });
}

export function upsertNotificationPreference(
  category: string,
  isEnabled: boolean,
  accessToken: string,
): Promise<NotificationPreference> {
  return apiRequest(`/communication/notification-preferences/EMAIL/${encodeURIComponent(category)}`, {
    method: "PUT",
    body: { isEnabled },
    accessToken,
  });
}

export type AnnouncementAudience = "ALL" | "STAFF" | "TEACHERS" | "PARENTS" | "STUDENTS" | "CLASSROOM";

export interface Announcement {
  id: string;
  title: string;
  body: string;
  audienceScope: AnnouncementAudience;
  classroomId: string | null;
  publishedAt: string | null;
  expiresAt: string | null;
}

export interface CreateAnnouncementInput {
  title: string;
  body: string;
  audienceScope: AnnouncementAudience;
  classroomId?: string;
  publishedAt?: string;
  expiresAt?: string;
}

// Staff-side (tenant): manage announcements.
export function createAnnouncement(
  input: CreateAnnouncementInput,
  creds: TenantCredentials,
): Promise<Announcement> {
  return apiRequest("/communication/announcements", { method: "POST", body: input, ...creds });
}

export function listAnnouncements(creds: TenantCredentials): Promise<Announcement[]> {
  return apiRequest("/communication/announcements", { ...creds });
}

export function removeAnnouncement(id: string, creds: TenantCredentials): Promise<void> {
  return apiRequest(`/communication/announcements/${id}`, { method: "DELETE", ...creds });
}

export type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type TicketStatus = "OPEN" | "IN_PROGRESS" | "WAITING_ON_TENANT" | "RESOLVED" | "CLOSED";

export interface SupportTicketMessage {
  id: string;
  ticketId: string;
  authorUserId: string;
  body: string;
  isInternalNote: boolean;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  createdByUserId: string;
  subject: string;
  category: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  assignedToUserId: string | null;
  closedAt: string | null;
  createdAt: string;
  messages?: SupportTicketMessage[];
}

// Staff-side (tenant): open and follow up on one's own support tickets.
export function createSupportTicket(
  input: { subject: string; category?: string; priority?: TicketPriority },
  creds: TenantCredentials,
): Promise<SupportTicket> {
  return apiRequest("/communication/support-tickets", { method: "POST", body: input, ...creds });
}

export function listMyTickets(creds: TenantCredentials): Promise<SupportTicket[]> {
  return apiRequest("/communication/support-tickets", { ...creds });
}

export function getMyTicket(id: string, creds: TenantCredentials): Promise<SupportTicket> {
  return apiRequest(`/communication/support-tickets/${id}`, { ...creds });
}

export function addTicketMessage(
  id: string,
  body: string,
  creds: TenantCredentials,
): Promise<SupportTicketMessage> {
  return apiRequest(`/communication/support-tickets/${id}/messages`, {
    method: "POST",
    body: { body },
    ...creds,
  });
}
