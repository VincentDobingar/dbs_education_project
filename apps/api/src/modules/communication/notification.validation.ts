import { z } from "zod";

export const listNotificationsQuerySchema = z.object({
  unreadOnly: z.coerce.boolean().optional(),
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

/**
 * EMAIL uniquement pour l'instant : IN_APP est la source de vérité (jamais
 * désactivable) et aucun appelant de notifyParentsOfStudent n'envoie encore de
 * SMS/PUSH — les accepter ici créerait un réglage qui ne changerait jamais rien.
 */
export const notificationPreferenceParamsSchema = z.object({
  channel: z.enum(["EMAIL"]),
  category: z.string().min(1),
});
export type NotificationPreferenceParams = z.infer<typeof notificationPreferenceParamsSchema>;

export const upsertNotificationPreferenceBodySchema = z.object({
  isEnabled: z.boolean(),
});
export type UpsertNotificationPreferenceBody = z.infer<typeof upsertNotificationPreferenceBodySchema>;
