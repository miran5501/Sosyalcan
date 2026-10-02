import { describe, expect, it } from "vitest";
import { createCustomerSchema, updateCustomerSchema } from "./validations/customer";
import { MAX_TAGS, MAX_TAG_LENGTH, normalizeTags } from "./tags";

describe("normalizeTags", () => {
  it("virgül, noktalı virgül ve satır sonuyla ayırır", () => {
    expect(normalizeTags("vip, restoran;spor\nyeni")).toEqual(["vip", "restoran", "spor", "yeni"]);
  });

  it("boşlukları kırpar/birleştirir, boşları ve tekrarları atar", () => {
    expect(normalizeTags("  vip ,, VIP ,  yeni   müşteri , ")).toEqual(["vip", "yeni müşteri"]);
  });

  it("büyük I ve İ ikisi de i olur: VIP ile vip aynı etiket sayılır (Türkçe kuralıyla vıp olurdu)", () => {
    expect(normalizeTags("VIP, Vip, vip")).toEqual(["vip"]);
    expect(normalizeTags("İSTANBUL")).toEqual(["istanbul"]);
  });

  it("küçük harfle yazılan ı ve Türkçe harfler olduğu gibi kalır", () => {
    expect(normalizeTags("ışık, ŞEKER, ÖĞRENCİ")).toEqual(["ışık", "şeker", "öğrenci"]);
  });

  it("dizi girdisini de aynı kurallarla temizler", () => {
    expect(normalizeTags(["VIP", " vip ", "Spor"])).toEqual(["vip", "spor"]);
  });

  it("boş girdi boş liste verir", () => {
    expect(normalizeTags("")).toEqual([]);
    expect(normalizeTags("  ,  ; ")).toEqual([]);
  });
});

describe("müşteri şemasında etiketler", () => {
  it("oluşturmada metin etiket listesine çevrilir; verilmezse alan yoktur", () => {
    expect(createCustomerSchema.parse({ name: "Atlas", tags: "VIP, spor" }).tags).toEqual(["vip", "spor"]);
    expect(createCustomerSchema.parse({ name: "Atlas" })).not.toHaveProperty("tags");
  });

  it("güncellemede etiket gönderilmezse alan sonuçta yoktur (mevcut etiketlere dokunulmaz)", () => {
    expect(updateCustomerSchema.parse({ name: "Yeni ad" })).toEqual({ name: "Yeni ad" });
  });

  it("boş metin etiketleri temizler", () => {
    expect(updateCustomerSchema.parse({ tags: "" })).toEqual({ tags: [] });
  });

  it("çok uzun etiketi ve fazla sayıda etiketi reddeder", () => {
    expect(createCustomerSchema.safeParse({ name: "Atlas", tags: "a".repeat(MAX_TAG_LENGTH + 1) }).success).toBe(false);
    expect(createCustomerSchema.safeParse({ name: "Atlas", tags: "a".repeat(MAX_TAG_LENGTH) }).success).toBe(true);
    const many = Array.from({ length: MAX_TAGS + 1 }, (_, i) => `etiket${i}`).join(",");
    expect(createCustomerSchema.safeParse({ name: "Atlas", tags: many }).success).toBe(false);
  });
});
