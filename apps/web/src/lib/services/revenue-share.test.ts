import { describe, expect, it, vi } from "vitest";

// splitAmount saf bir fonksiyon; servis dosyasının veritabanı istemcisi yüklenmesin diye taklit edilir.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { splitAmount } from "./revenue-share-service";

const partners = (...percents: number[]) => percents.map((p, i) => ({ name: `O${i + 1}`, sharePercent: p }));
const total = (shares: { amountKurus: number }[]) => shares.reduce((sum, s) => sum + s.amountKurus, 0);

describe("splitAmount", () => {
  it("tam bölünen tutarı oranlara göre dağıtır", () => {
    expect(splitAmount(100_000, partners(60, 40)).map((s) => s.amountKurus)).toEqual([60_000, 40_000]);
  });

  it("kalan kuruşu ilk ortağa ekler; toplam dağıtılan tutara eşit kalır", () => {
    const shares = splitAmount(1001, partners(50, 50));
    expect(shares.map((s) => s.amountKurus)).toEqual([501, 500]);
    expect(total(shares)).toBe(1001);
  });

  it("üçe bölünen tutarda hiç kuruş kaybolmaz", () => {
    for (const amount of [1, 2, 99, 100, 101, 12_345, 999_999]) {
      expect(total(splitAmount(amount, partners(34, 33, 33)))).toBe(amount);
    }
  });

  it("zarar veya sıfır durumunda kimseye pay düşmez", () => {
    expect(splitAmount(-5_000, partners(50, 50)).map((s) => s.amountKurus)).toEqual([0, 0]);
    expect(splitAmount(0, partners(50, 50)).map((s) => s.amountKurus)).toEqual([0, 0]);
  });

  it("ortak yoksa boş liste döner", () => {
    expect(splitAmount(10_000, [])).toEqual([]);
  });

  it("ortak adı ve yüzdesini sonuca taşır", () => {
    expect(splitAmount(1000, [{ name: "Ada", sharePercent: 100 }])).toEqual([
      { name: "Ada", sharePercent: 100, amountKurus: 1000 },
    ]);
  });
});
