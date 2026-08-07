import type { TenantStatus, UserStatus } from "@prisma/client";

export interface AuthenticatedUser {
  id: string;
  email: string;
  status: UserStatus;
}

export interface RequestTenant {
  id: string;
  name: string;
  status: TenantStatus;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      tenant?: RequestTenant;
    }
  }
}

export {};
