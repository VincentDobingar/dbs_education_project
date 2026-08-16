import { z } from "zod";

export const upsertPlatformSettingSchema = z.object({
  value: z.unknown(),
  justification: z.string().optional(),
});
export type UpsertPlatformSettingInput = z.infer<typeof upsertPlatformSettingSchema>;

export const deletePlatformSettingSchema = z.object({
  justification: z.string().optional(),
});
export type DeletePlatformSettingInput = z.infer<typeof deletePlatformSettingSchema>;
