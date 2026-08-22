import { z } from "zod";

const LEAVE_TYPES = ["ANNUAL", "SICK", "MATERNITY", "UNPAID", "OTHER"] as const;

export const createLeaveRequestSchema = z
  .object({
    type: z.enum(LEAVE_TYPES),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    reason: z.string().optional(),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: "endDate must be on or after startDate",
    path: ["endDate"],
  });
export type CreateLeaveRequestInput = z.infer<typeof createLeaveRequestSchema>;

const DECIDABLE_LEAVE_STATUSES = ["APPROVED", "REJECTED", "CANCELLED"] as const;

export const decideLeaveRequestSchema = z.object({
  status: z.enum(DECIDABLE_LEAVE_STATUSES),
});
export type DecideLeaveRequestInput = z.infer<typeof decideLeaveRequestSchema>;
