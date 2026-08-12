import { z } from "zod";

export const revokeRelationshipSchema = z.object({
  reason: z.string().min(1),
});
export type RevokeRelationshipInput = z.infer<typeof revokeRelationshipSchema>;

export const listRelationshipsQuerySchema = z.object({
  studentId: z.string().min(1).optional(),
});
export type ListRelationshipsQuery = z.infer<typeof listRelationshipsQuerySchema>;
