import { z } from "zod";

export const createInvitationSchema = z
  .object({
    studentId: z.string().min(1),
    beneficiaryCategory: z.enum(["PARENT", "STUDENT"]),
    invitedEmail: z.string().email().optional(),
    invitedPhone: z.string().min(1).optional(),
  })
  .refine((data) => data.invitedEmail ?? data.invitedPhone, {
    message: "invitedEmail or invitedPhone is required",
    path: ["invitedEmail"],
  });
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

export const redeemActivationSchema = z.object({
  code: z.string().min(1),
});
export type RedeemActivationInput = z.infer<typeof redeemActivationSchema>;

export const listInvitationsQuerySchema = z.object({
  studentId: z.string().min(1).optional(),
});
export type ListInvitationsQuery = z.infer<typeof listInvitationsQuerySchema>;
