import { describe, expect, it } from "vitest";
import { createTaskSchema, updateTaskSchema } from "./task";
import { createShootSchema, updateShootSchema } from "./shoot";

// Kısmi güncellemede gönderilmeyen alan sonuçta yer almamalı: aksi halde şemadaki varsayılan
// değer (örn. öncelik "Orta", çekim türü "Video") mevcut kaydın üzerine yazılır.
describe("kısmi güncelleme şemaları varsayılan değer eklemez", () => {
  it("görev: yalnızca başlık gönderilince öncelik sonuca girmez", () => {
    expect(updateTaskSchema.parse({ title: "Yeni başlık" })).toEqual({ title: "Yeni başlık" });
  });

  it("çekim: yalnızca konum gönderilince tür sonuca girmez", () => {
    expect(updateShootSchema.parse({ location: "Stüdyo" })).toEqual({ location: "Stüdyo" });
  });
});

describe("düzenleme için eklenen alanlar", () => {
  it("görev güncellemesi durum kabul eder, geçersiz durumu reddeder", () => {
    expect(updateTaskSchema.parse({ statusId: "opt_task_revision" })).toEqual({ statusId: "opt_task_revision" });
    expect(updateTaskSchema.safeParse({ statusId: "" }).success).toBe(false);
    // Gönderilmeyen paylaşım yerleri boş listeyle ezilmez.
    expect(updateTaskSchema.parse({ title: "Yeni başlık" })).toEqual({ title: "Yeni başlık" });
  });

  it("çekim güncellemesi yalnızca gönderilen alanları içerir (tür/durum/paylaşım yerine varsayılan eklenmez)", () => {
    expect(updateShootSchema.parse({ deliveryStatusId: "opt_status_shot" })).toEqual({ deliveryStatusId: "opt_status_shot" });
    expect(updateShootSchema.parse({ location: "Sahil" })).toEqual({ location: "Sahil" });
    expect(updateShootSchema.safeParse({ deliveryStatusId: "" }).success).toBe(false);
  });

  it("oluşturmada varsayılanlar korunur (öncelik Orta; çekim türü seçilmezse serviste listenin ilki)", () => {
    expect(createTaskSchema.parse({ title: "Reels kurgusu" }).priority).toBe("MEDIUM");
    expect(createShootSchema.parse({ scheduledAt: "2026-09-21T15:13" }).typeId).toBeUndefined();
  });
});

describe("teslim linki yalnızca http(s) olabilir", () => {
  it.each(["https://drive.google.com/x", "http://ornek.com/a b".replace(" ", "")])("%s kabul edilir", (link) => {
    expect(updateShootSchema.safeParse({ deliveryLink: link }).success).toBe(true);
  });

  it.each(["javascript:alert(1)", "ftp://x.com/a", "drive.google.com/x", "https://a b.com"])("%s reddedilir", (link) => {
    expect(updateShootSchema.safeParse({ deliveryLink: link }).success).toBe(false);
  });

  it("boş metin (linki temizlemek) kabul edilir", () => {
    expect(updateShootSchema.safeParse({ deliveryLink: "" }).success).toBe(true);
  });
});
