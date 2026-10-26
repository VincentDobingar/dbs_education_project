import type { GridBreak } from "../components/TimetableGrid.js";

import { apiRequest, type TenantCredentials } from "./apiClient.js";

export const loadBreaks = (creds: TenantCredentials) => apiRequest<GridBreak[]>("/school-config/timetable-breaks", creds);
