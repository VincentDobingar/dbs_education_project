import { z } from "zod";

export const createRoomSchema = z.object({
  name: z.string().min(1),
  campusId: z.string().min(1).optional(),
  capacity: z.coerce.number().int().positive().optional(),
});
export type CreateRoomInput = z.infer<typeof createRoomSchema>;

export const updateRoomSchema = createRoomSchema.partial();
export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;

export const listRoomsQuerySchema = z.object({
  campusId: z.string().min(1).optional(),
});
export type ListRoomsQuery = z.infer<typeof listRoomsQuerySchema>;
