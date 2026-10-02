import { z } from "zod";
import { OPTION_COLOR_KEYS, OPTION_KINDS } from "@/lib/options";

const label = z.string().trim().min(1, "Ad boş olamaz").max(40, "Ad en fazla 40 karakter olabilir");
// Formdan boş gelen renk "renk yok" demektir.
const color = z
  .enum(OPTION_COLOR_KEYS as [string, ...string[]])
  .or(z.literal("").transform(() => undefined))
  .optional();

// "Tamamlandı sayılır" işareti (yalnızca görev durumları); formdan "on", API'den true/false gelir.
const isDone = z
  .preprocess((v) => (v === "on" || v === "true" ? true : v === "false" || v === "" ? false : v), z.boolean())
  .optional();

export const createOptionSchema = z.object({
  kind: z.enum(OPTION_KINDS),
  label,
  color,
  isDone,
  parentId: z.string().optional(),
});

// Kısmi güncelleme: varsayılan değer OLMAMALI (bkz. task.ts).
export const updateOptionSchema = z.object({ label, color, isDone }).partial();

export const moveOptionSchema = z.object({ direction: z.enum(["up", "down"]) });

export type CreateOptionInput = z.infer<typeof createOptionSchema>;
export type UpdateOptionInput = z.infer<typeof updateOptionSchema>;
