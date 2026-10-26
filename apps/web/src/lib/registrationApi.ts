import { apiRequest, apiUpload, type TenantCredentials } from "./apiClient.js";

export interface SchoolGuardian {
  centralGuardianId?: string | null;
  photoUrl?: string | null;
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  address: string | null;
  students: { id: string; firstName: string; lastName: string; matricule: string }[];
}
export interface Installment {
  amountCents: number;
  dueDate: string;
}
export interface RegistrationPeriod {
  id: string;
  name: string;
  academicYearId: string;
  isOpen: boolean;
  startDate: string;
  endDate: string;
  installments: Installment[];
  academicYear: { id: string; name: string };
}
export interface Registration {
  id: string;
  status: string;
  student: {
    id: string;
    matricule: string;
    firstName: string;
    lastName: string;
    primaryGuardian: SchoolGuardian | null;
  };
  classroom: { name: string };
  academicYear: { name: string };
  registrationPeriod: RegistrationPeriod | null;
}
export function listGuardians(creds: TenantCredentials): Promise<SchoolGuardian[]> {
  return apiRequest("/registrations/guardians", creds);
}
export function saveGuardian(
  input: { firstName: string; lastName: string; phone: string; email?: string; address?: string },
  creds: TenantCredentials,
  id?: string,
): Promise<SchoolGuardian> {
  return apiRequest(`/registrations/guardians${id ? `/${id}` : ""}`, {
    ...creds,
    method: id ? "PATCH" : "POST",
    body: input,
  });
}
export function listRegistrationPeriods(creds: TenantCredentials): Promise<RegistrationPeriod[]> {
  return apiRequest("/registrations/periods", creds);
}
export function createRegistrationPeriod(
  input: {
    name: string;
    academicYearId: string;
    startDate: string;
    endDate: string;
    installments: Installment[];
  },
  creds: TenantCredentials,
): Promise<RegistrationPeriod> {
  return apiRequest("/registrations/periods", { ...creds, method: "POST", body: input });
}
export function setRegistrationPeriodOpen(
  id: string,
  isOpen: boolean,
  creds: TenantCredentials,
): Promise<RegistrationPeriod> {
  return apiRequest(`/registrations/periods/${id}`, { ...creds, method: "PATCH", body: { isOpen } });
}
export function listRegistrations(creds: TenantCredentials, academicYearId: string): Promise<Registration[]> {
  return apiRequest(
    `/registrations/enrollments${academicYearId ? `?academicYearId=${encodeURIComponent(academicYearId)}` : ""}`,
    creds,
  );
}

export function uploadGuardianPhoto(
  id: string,
  file: File,
  creds: TenantCredentials,
): Promise<SchoolGuardian> {
  return apiUpload(`/registrations/guardians/${id}/photo`, "photo", file, creds);
}
