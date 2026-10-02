import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Geçerli bir e-posta girin"),
  password: z.string().min(6, "Şifre en az 6 karakter olmalı").max(200),
});

/**
 * Yeni şifre kuralı (kullanıcı oluşturma, şifre sıfırlama, şifre değiştirme).
 * bcrypt 72 bayttan sonrasını yok saydığı için üst sınır 72.
 */
export const passwordSchema = z
  .string()
  .min(8, "Şifre en az 8 karakter olmalı")
  .max(72, "Şifre en fazla 72 karakter olabilir")
  .regex(/\p{L}/u, "Şifre en az bir harf içermeli")
  .regex(/\d/, "Şifre en az bir rakam içermeli");

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Mevcut şifreyi girin"),
    newPassword: passwordSchema,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: "Yeni şifre eskisiyle aynı olamaz",
    path: ["newPassword"],
  });

export const refreshSchema = z.object({
  refreshToken: z.string().min(20).max(200),
});

export type LoginInput = z.infer<typeof loginSchema>;
