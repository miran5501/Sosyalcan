import { z } from "zod";
import { MAX_TAGS, MAX_TAG_LENGTH, normalizeTags } from "@/lib/tags";

// Formdan virgülle ayrılmış metin, API'den dizi gelebilir; ikisi de temiz bir listeye çevrilir.
const tagsField = z
  .union([z.string(), z.array(z.string())])
  .transform(normalizeTags)
  .pipe(
    z
      .array(z.string().max(MAX_TAG_LENGTH, `Etiket en fazla ${MAX_TAG_LENGTH} karakter olabilir`))
      .max(MAX_TAGS, `En fazla ${MAX_TAGS} etiket eklenebilir`),
  )
  .optional();

export const createCustomerSchema = z.object({
  name: z.string().min(2, "Müşteri adı en az 2 karakter olmalı"),
  contact: z.string().optional(),
  notes: z.string().optional(),
  tags: tagsField,
});

export const updateCustomerSchema = createCustomerSchema.partial();

export const customerListQuerySchema = z.object({
  search: z.string().optional(),
  tag: z.string().optional(),
  includeArchived: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
