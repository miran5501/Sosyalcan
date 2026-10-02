import { z } from "zod";

export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;

// Görev durumu ve paylaşım yerleri admin'in yönettiği seçeneklerin kimlikleridir; geçerlilikleri
// (doğru liste, kaldırılmamış) serviste veritabanından kontrol edilir.
const optionId = z.string().min(1, "Seçenek gerekli");

const taskFields = {
  title: z.string().min(2, "Başlık en az 2 karakter olmalı"),
  description: z.string().optional(),
  priority: z.enum(TASK_PRIORITIES),
  dueDate: z.string().optional(), // ISO string, formdan gelir
  customerId: z.string().optional(),
  assigneeId: z.string().optional(),
  publishTargetIds: z.array(z.string()).max(30, "En fazla 30 paylaşım yeri seçilebilir"),
};

// Oluştururken öncelik verilmezse "Orta" olur, durum her zaman listenin ilk durumudur. Güncellemede
// varsayılan DEĞER OLMAMALI: gönderilmeyen alan mevcut kaydın üzerine yazılmamalı (partial() varsayılanı korur).
export const createTaskSchema = z.object({
  ...taskFields,
  priority: taskFields.priority.default("MEDIUM"),
  publishTargetIds: taskFields.publishTargetIds.optional(),
});

export const updateTaskSchema = z.object(taskFields).partial().extend({
  statusId: optionId.optional(),
});

export const updateTaskStatusSchema = z.object({
  statusId: optionId,
});

export const createTaskCommentSchema = z.object({
  body: z.string().trim().min(1, "Yorum boş olamaz").max(2000, "Yorum en fazla 2000 karakter olabilir"),
});

// Bağlantı arayüzde tıklanabilir gösterilir: yalnızca http(s) (javascript: gibi adresler kod çalıştırabilir).
export const createTaskLinkSchema = z.object({
  url: z
    .string()
    .trim()
    .max(500, "Adres en fazla 500 karakter olabilir")
    .regex(/^https?:\/\/\S+$/i, "Adres http:// veya https:// ile başlamalı"),
  label: z.string().trim().max(100, "Etiket en fazla 100 karakter olabilir").optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type CreateTaskCommentInput = z.infer<typeof createTaskCommentSchema>;
export type CreateTaskLinkInput = z.infer<typeof createTaskLinkSchema>;
