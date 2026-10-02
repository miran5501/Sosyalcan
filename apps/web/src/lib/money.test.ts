import { describe, expect, it } from "vitest";
import { kurusToTLInput, parseTLInputToKurus } from "./money";

describe("parseTLInputToKurus", () => {
  it.each([
    ["1250", 125000],
    ["1250,50", 125050],
    ["1.250,50", 125050],
    ["1.250.000,00", 125000000],
    ["0,5", 50],
    ["19,99", 1999],
    ["  1250,00  ", 125000],
  ])("Türkçe biçim %j -> %i kuruş", (input, expected) => {
    expect(parseTLInputToKurus(input)).toBe(expected);
  });

  it("noktalı ondalığı ondalık olarak okur (eski hata: 1250.50 -> 125050 TL)", () => {
    expect(parseTLInputToKurus("1250.50")).toBe(125050);
    expect(parseTLInputToKurus("12.5")).toBe(1250);
  });

  it("noktadan sonra 3 hane binlik ayracıdır", () => {
    expect(parseTLInputToKurus("1.250")).toBe(125000);
    expect(parseTLInputToKurus("1.000.000")).toBe(100000000);
  });

  it("₺ ve TL işaretlerini yok sayar", () => {
    expect(parseTLInputToKurus("₺1.250,00")).toBe(125000);
    expect(parseTLInputToKurus("1250 TL")).toBe(125000);
  });

  it("boş metin 0 sayılır", () => {
    expect(parseTLInputToKurus("")).toBe(0);
    expect(parseTLInputToKurus("   ")).toBe(0);
  });

  it.each(["abc", "-100", "12,345", "1,2,3", "1.25.000", "12..5", ",50"])("bozuk girdi %j hata verir", (input) => {
    expect(() => parseTLInputToKurus(input)).toThrow("Geçersiz tutar");
  });
});

describe("kurusToTLInput", () => {
  it.each([
    [0, "0,00"],
    [5, "0,05"],
    [100, "1,00"],
    [125050, "1250,50"],
    [350000, "3500,00"],
    [123456789, "1234567,89"],
  ])("%i kuruş -> %s", (kurus, expected) => {
    expect(kurusToTLInput(kurus)).toBe(expected);
  });

  it("parseTLInputToKurus ile gidiş-dönüş aynı değeri verir", () => {
    for (const kurus of [1, 99, 100, 101, 999, 12345, 1_000_000, 987_654_321]) {
      expect(parseTLInputToKurus(kurusToTLInput(kurus))).toBe(kurus);
    }
  });
});
