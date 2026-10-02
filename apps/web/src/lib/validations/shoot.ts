import { z } from "zod";

// Teslim linki arayüzde tıklanabilir bağlantı olarak gösterilir: yalnızca http(s) kabul edilir
// (javascript: gibi adresler tıklanınca kod çalıştırabilir).
const deliveryLink = z
  .string()
  .optional()
  .refine((v) => !v || /^https?:\/\/\S+$/i.test(v), "Teslim linki http:// veya https:// ile başlayan bir adres olmalı");

// Tür, durum ve yayın hedefleri admin'in yönettiği seçeneklerin kimlikleridir; geçerlilikleri
// (doğru liste, kaldırılmamış) serviste veritabanından kontrol edilir.
const optionId = z.string().min(1, "Seçenek gerekli");

const shootFields = {
  typeId: optionId,
  scheduledAt: z.string().min(1, "Tarih/saat gerekli"), // ISO string, formdan gelir
  location: z.string().optional(),
  brief: z.string().optional(),
  equipment: z.string().max(2000, "Ekipman notu en fazla 2000 karakter olabilir").optional(), // listede olmayanlar için serbest not
  deliveryLink,
  publishTargetIds: z.array(z.string()).max(30, "En fazla 30 paylaşım yeri seçilebilir"),
  equipmentIds: z.array(z.string()).max(60, "En fazla 60 ekipman seçilebilir"),
  customerId: z.string().optional(),
  assigneeId: z.string().optional(),
  revisionCount: z.coerce.number().int().min(0, "Revizyon sayısı eksi olamaz").max(99, "Revizyon sayısı en fazla 99").optional(),
};

// Oluştururken tür ve paylaşım yeri verilmeyebilir (tür = listenin ilki). Güncellemede varsayılan DEĞER OLMAMALI (bkz. task.ts).
export const createShootSchema = z.object({
  ...shootFields,
  typeId: optionId.optional(),
  publishTargetIds: shootFields.publishTargetIds.optional(),
  equipmentIds: shootFields.equipmentIds.optional(),
});

export const updateShootSchema = z.object(shootFields).partial().extend({
  deliveryStatusId: optionId.optional(),
});

export const updateDeliveryStatusSchema = z.object({
  deliveryStatusId: optionId,
});

export const checklistItemSchema = z.object({
  label: z.string().trim().min(1, "Madde adı gerekli").max(120, "Madde adı en fazla 120 karakter olabilir"),
});

export const checklistToggleSchema = z.object({ done: z.boolean() });

export type CreateShootInput = z.infer<typeof createShootSchema>;
export type UpdateShootInput = z.infer<typeof updateShootSchema>;
