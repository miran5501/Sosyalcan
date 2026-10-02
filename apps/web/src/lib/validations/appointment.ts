import { z } from "zod";

export const createAppointmentSchema = z.object({
  title: z.string().min(2, "Başlık en az 2 karakter olmalı"),
  startsAt: z.string().min(1, "Tarih/saat gerekli"),
  customerId: z.string().optional(),
  // Katılımcı kullanıcı kimlikleri. Güncellemede gönderilirse liste bütünüyle değişir;
  // hiç gönderilmezse mevcut katılımcılara dokunulmaz.
  participantIds: z.array(z.string().min(1)).max(50, "En fazla 50 katılımcı eklenebilir").optional(),
});

export const updateAppointmentSchema = createAppointmentSchema.partial();

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;
