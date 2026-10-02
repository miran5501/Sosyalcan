import { describe, expect, it } from "vitest";
import { netOfVat, vatFromGross, vatSummary } from "./vat";

describe("vatFromGross (KDV dahil tutardan KDV payı)", () => {
  it("yaygın oranlar", () => {
    expect(vatFromGross(120_000, 20)).toBe(20_000); // 1.200 TL, %20 → 200 TL
    expect(vatFromGross(110_000, 10)).toBe(10_000);
    expect(vatFromGross(101_000, 1)).toBe(1_000);
    expect(vatFromGross(50_000, 0)).toBe(0);
  });

  it("en yakın kuruşa yuvarlar, float hatası yok", () => {
    expect(vatFromGross(1_000, 20)).toBe(167); // 10 TL × 20/120 = 1,6666… → 1,67
    expect(vatFromGross(100, 20)).toBe(17); // 16,67 kuruş → 17
    expect(vatFromGross(99_999_999, 20)).toBe(16_666_667);
    expect(netOfVat(1_000, 20)).toBe(833);
  });

  it("geçersiz girdiyi reddeder", () => {
    expect(() => vatFromGross(-1, 20)).toThrow();
    expect(() => vatFromGross(10.5, 20)).toThrow();
    expect(() => vatFromGross(100, 101)).toThrow();
  });
});

describe("vatSummary", () => {
  it("hesaplanan − indirilecek = ödenecek; KDV'siz kayıtlar sıfır sayılır", () => {
    expect(
      vatSummary([
        { type: "INCOME", vatAmount: 20_000 },
        { type: "INCOME", vatAmount: null },
        { type: "EXPENSE", vatAmount: 5_000 },
      ]),
    ).toEqual({ vatCollectedKurus: 20_000, vatPaidKurus: 5_000, vatPayableKurus: 15_000 });
  });
});
