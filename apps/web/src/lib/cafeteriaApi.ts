import { apiRequest, type TenantCredentials } from "./apiClient.js";

export interface Menu {
  id: string;
  date: string;
  description: string;
}

export function listMenus(
  query: { startDate?: string; endDate?: string },
  creds: TenantCredentials,
): Promise<Menu[]> {
  const params = new URLSearchParams();
  if (query.startDate) params.set("startDate", query.startDate);
  if (query.endDate) params.set("endDate", query.endDate);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`/cafeteria/menus${suffix}`, { ...creds });
}

export function createMenu(
  input: { date: string; description: string },
  creds: TenantCredentials,
): Promise<Menu> {
  return apiRequest("/cafeteria/menus", { method: "POST", body: input, ...creds });
}

export function removeMenu(id: string, creds: TenantCredentials): Promise<void> {
  return apiRequest(`/cafeteria/menus/${id}`, { method: "DELETE", ...creds });
}

export type MealPlanType = "DAILY" | "WEEKLY" | "MONTHLY";

export interface MealPlan {
  id: string;
  name: string;
  type: MealPlanType;
  priceCents: number;
  deletedAt: string | null;
}

export function listMealPlans(creds: TenantCredentials): Promise<MealPlan[]> {
  return apiRequest("/cafeteria/meal-plans", { ...creds });
}

export function createMealPlan(
  input: { name: string; type: MealPlanType; priceCents: number },
  creds: TenantCredentials,
): Promise<MealPlan> {
  return apiRequest("/cafeteria/meal-plans", { method: "POST", body: input, ...creds });
}

export function archiveMealPlan(id: string, creds: TenantCredentials): Promise<MealPlan> {
  return apiRequest(`/cafeteria/meal-plans/${id}/archive`, { method: "POST", ...creds });
}

export type MealEnrollmentStatus = "ACTIVE" | "CANCELLED";

export interface MealEnrollment {
  id: string;
  studentId: string;
  mealPlanId: string;
  startDate: string;
  endDate: string | null;
  status: MealEnrollmentStatus;
  paid: boolean;
  paidAt: string | null;
}

export function listEnrollments(
  query: { studentId?: string; mealPlanId?: string },
  creds: TenantCredentials,
): Promise<MealEnrollment[]> {
  const params = new URLSearchParams();
  if (query.studentId) params.set("studentId", query.studentId);
  if (query.mealPlanId) params.set("mealPlanId", query.mealPlanId);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`/cafeteria/enrollments${suffix}`, { ...creds });
}

export function createEnrollment(
  input: { studentId: string; mealPlanId: string; startDate: string; endDate?: string },
  creds: TenantCredentials,
): Promise<MealEnrollment> {
  return apiRequest("/cafeteria/enrollments", { method: "POST", body: input, ...creds });
}

export function markEnrollmentPaid(id: string, creds: TenantCredentials): Promise<MealEnrollment> {
  return apiRequest(`/cafeteria/enrollments/${id}/mark-paid`, { method: "POST", ...creds });
}

export function cancelEnrollment(id: string, creds: TenantCredentials): Promise<MealEnrollment> {
  return apiRequest(`/cafeteria/enrollments/${id}/cancel`, { method: "POST", ...creds });
}

export type MealAttendanceStatus = "SERVED" | "ABSENT";

export interface MealAttendance {
  id: string;
  enrollmentId: string;
  date: string;
  status: MealAttendanceStatus;
}

export function listMealAttendance(
  enrollmentId: string,
  date: string | undefined,
  creds: TenantCredentials,
): Promise<MealAttendance[]> {
  const suffix = date ? `?date=${date}` : "";
  return apiRequest(`/cafeteria/enrollments/${enrollmentId}/attendance${suffix}`, { ...creds });
}

export function recordMealAttendance(
  enrollmentId: string,
  input: { date: string; status: MealAttendanceStatus },
  creds: TenantCredentials,
): Promise<MealAttendance> {
  return apiRequest(`/cafeteria/enrollments/${enrollmentId}/attendance`, {
    method: "POST",
    body: input,
    ...creds,
  });
}
