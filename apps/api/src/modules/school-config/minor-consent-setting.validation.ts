import { z } from "zod";

export const minorConsentSettingSchema = z.object({
  enabled: z.boolean(),
  majorityAge: z.number().int().min(1).max(25),
});
export type MinorConsentSettingInput = z.infer<typeof minorConsentSettingSchema>;
