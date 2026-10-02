import { z } from "zod";
import { passwordSchema } from "@/lib/validations/auth";

export const ROLES = ["ADMIN", "OPERATIONS", "FINANCE", "VIEWER"] as const;

export const createUserSchema = z.object({
  name: z.string().min(2, "İsim en az 2 karakter olmalı"),
  email: z.string().email("Geçerli bir e-posta girin"),
  password: passwordSchema,
  role: z.enum(ROLES),
});

export const updateUserSchema = z.object({
  name: z.string().min(2, "İsim en az 2 karakter olmalı").optional(),
  role: z.enum(ROLES).optional(),
  disabled: z.boolean().optional(),
  password: passwordSchema.optional(),
});

export const partnersSchema = z
  .array(
    z.object({
      name: z.string().min(2, "Ortak adı en az 2 karakter olmalı"),
      sharePercent: z.number().int().min(1, "Oran en az %1 olmalı").max(100),
    }),
  )
  .min(1, "En az bir ortak tanımlı olmalı")
  .max(10, "En fazla 10 ortak tanımlanabilir")
  .refine((partners) => partners.reduce((sum, p) => sum + p.sharePercent, 0) === 100, {
    message: "Oranların toplamı tam olarak %100 olmalı",
  });

export const revenueShareQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  basis: z.enum(["net", "gross"]).optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type PartnersInput = z.infer<typeof partnersSchema>;
