import { z } from "zod";
import { NOTIFICATION_TYPE_KEYS } from "@/lib/notification-types";

export const markReadSchema = z
  .object({
    ids: z.array(z.string().min(1)).max(200).optional(),
    all: z.boolean().optional(),
  })
  .refine((v) => v.all === true || (v.ids && v.ids.length > 0), "Okundu işaretlenecek bildirim seçilmedi");

export const preferencesSchema = z.object({
  preferences: z
    .array(
      z.object({
        type: z.enum(NOTIFICATION_TYPE_KEYS as [string, ...string[]]),
        inApp: z.boolean(),
        email: z.boolean(),
      }),
    )
    .max(50),
});

export const listQuerySchema = z.object({
  unread: z
    .enum(["1", "true"])
    .optional()
    .transform((v) => Boolean(v)),
});
