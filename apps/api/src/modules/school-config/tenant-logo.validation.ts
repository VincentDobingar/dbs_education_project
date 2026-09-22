import { z } from "zod";

import { httpUrlSchema } from "../../lib/http-url-schema.js";

export const setTenantLogoSchema = z.object({
  logoUrl: httpUrlSchema,
});
export type SetTenantLogoInput = z.infer<typeof setTenantLogoSchema>;
