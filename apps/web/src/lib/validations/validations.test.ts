import { describe, expect, it } from "vitest";
import { loginSchema } from "./auth";
import { createTaskSchema, updateTaskStatusSchema } from "./task";
import { updateDeliveryStatusSchema } from "./shoot";

describe("loginSchema", () => {
  it("geçerli girişi kabul eder", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "123456" }).success).toBe(true);
  });

  it("bozuk e-posta ve kısa şifreyi reddeder", () => {
    expect(loginSchema.safeParse({ email: "e-posta-degil", password: "123456" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "123" }).success).toBe(false);
  });
});

describe("görev doğrulaması", () => {
  it("öncelik verilmezse ORTA olur", () => {
    expect(createTaskSchema.parse({ title: "Reels kurgusu" }).priority).toBe("MEDIUM");
  });

  it("çok kısa başlığı reddeder", () => {
    expect(createTaskSchema.safeParse({ title: "a" }).success).toBe(false);
  });

  it("görev durumu kimliği zorunludur (geçerliliğini servis listeden denetler)", () => {
    expect(updateTaskStatusSchema.safeParse({ statusId: "opt_task_editing" }).success).toBe(true);
    expect(updateTaskStatusSchema.safeParse({ statusId: "" }).success).toBe(false);
    expect(updateTaskStatusSchema.safeParse({ status: "EDITING" }).success).toBe(false);
  });
});

describe("çekim teslim durumu", () => {
  it("durum kimliği zorunludur", () => {
    // Durumlar artık admin'in eklediği seçenekler: şema kimlik ister, geçerliliği servis veritabanından denetler.
    expect(updateDeliveryStatusSchema.safeParse({ deliveryStatusId: "opt_status_delivered" }).success).toBe(true);
    expect(updateDeliveryStatusSchema.safeParse({ deliveryStatusId: "" }).success).toBe(false);
    expect(updateDeliveryStatusSchema.safeParse({ deliveryStatus: "DELIVERED" }).success).toBe(false);
  });
});

describe("passwordSchema / changePasswordSchema", () => {
  it("en az 8 karakter, harf ve rakam ister; 72 karakteri geçemez", async () => {
    const { passwordSchema } = await import("./auth");
    expect(passwordSchema.safeParse("sifre123").success).toBe(true);
    expect(passwordSchema.safeParse("şifre123").success).toBe(true);
    expect(passwordSchema.safeParse("kisa1").success).toBe(false);
    expect(passwordSchema.safeParse("sadeceharf").success).toBe(false);
    expect(passwordSchema.safeParse("12345678").success).toBe(false);
    expect(passwordSchema.safeParse("a1".repeat(37)).success).toBe(false);
  });

  it("yeni şifre eskisiyle aynı olamaz", async () => {
    const { changePasswordSchema } = await import("./auth");
    expect(changePasswordSchema.safeParse({ currentPassword: "eski1234", newPassword: "eski1234" }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ currentPassword: "eski1234", newPassword: "yeni5678" }).success).toBe(true);
  });
});
