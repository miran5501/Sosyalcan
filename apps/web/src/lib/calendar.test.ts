import { describe, expect, it } from "vitest";
import { anchorParam, monthsInRange, paymentDueDate, parseAnchor, parseView, rangeFor, shiftAnchor, startOfWeek } from "./calendar";

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

describe("parseView", () => {
  it("bilinmeyen veya boş değer ay görünümüne düşer", () => {
    expect(parseView(undefined)).toBe("month");
    expect(parseView("yil")).toBe("month");
    expect(parseView("week")).toBe("week");
    expect(parseView("day")).toBe("day");
  });
});

describe("startOfWeek (hafta Pazartesi başlar)", () => {
  it("haftanın her gününden aynı Pazartesi'yi bulur", () => {
    // 21 Eylül 2026 Pazartesi
    for (const day of [21, 22, 23, 24, 25, 26, 27]) expect(startOfWeek(d(2026, 9, day))).toEqual(d(2026, 9, 21));
  });

  it("ay ve yıl sınırını geçer", () => {
    expect(startOfWeek(d(2026, 1, 1))).toEqual(d(2025, 12, 29)); // 1 Ocak 2026 Perşembe
    expect(startOfWeek(d(2026, 3, 1))).toEqual(d(2026, 2, 23)); // 1 Mart 2026 Pazar
  });
});

describe("parseAnchor", () => {
  const now = new Date(2026, 8, 20, 15, 30);

  it("date parametresini yerel gün olarak okur", () => {
    expect(parseAnchor({ date: "2026-10-05" }, now)).toEqual(d(2026, 10, 5));
  });

  it("eski month parametresi ayın 1'ine gider", () => {
    expect(parseAnchor({ month: "2026-11" }, now)).toEqual(d(2026, 11, 1));
  });

  it("geçersiz değerler (olmayan gün, çöp, ay 13) bugüne düşer", () => {
    const today = d(2026, 9, 20);
    expect(parseAnchor({ date: "2026-02-31" }, now)).toEqual(today);
    expect(parseAnchor({ date: "yarin" }, now)).toEqual(today);
    expect(parseAnchor({ month: "2026-13" }, now)).toEqual(today);
    expect(parseAnchor({}, now)).toEqual(today);
  });
});

describe("rangeFor", () => {
  it("ay: ayın 1'inden sonraki ayın 1'ine", () => {
    expect(rangeFor("month", d(2026, 9, 20))).toEqual({ start: d(2026, 9, 1), end: d(2026, 10, 1) });
    expect(rangeFor("month", d(2026, 12, 5))).toEqual({ start: d(2026, 12, 1), end: d(2027, 1, 1) });
  });

  it("hafta: Pazartesi'den 7 gün sonrasına", () => {
    expect(rangeFor("week", d(2026, 9, 23))).toEqual({ start: d(2026, 9, 21), end: d(2026, 9, 28) });
  });

  it("gün: o günden ertesi güne", () => {
    expect(rangeFor("day", new Date(2026, 8, 20, 18, 45))).toEqual({ start: d(2026, 9, 20), end: d(2026, 9, 21) });
  });
});

describe("shiftAnchor", () => {
  it("ay ±1 (ayın 1'i), hafta ±7 gün, gün ±1 gün", () => {
    expect(shiftAnchor("month", d(2026, 1, 15), -1)).toEqual(d(2025, 12, 1));
    expect(shiftAnchor("month", d(2026, 12, 15), 1)).toEqual(d(2027, 1, 1));
    expect(shiftAnchor("week", d(2026, 9, 21), 1)).toEqual(d(2026, 9, 28));
    expect(shiftAnchor("week", d(2026, 9, 21), -1)).toEqual(d(2026, 9, 14));
    expect(shiftAnchor("day", d(2026, 9, 30), 1)).toEqual(d(2026, 10, 1));
    expect(shiftAnchor("day", d(2026, 1, 1), -1)).toEqual(d(2025, 12, 31));
  });

  it("anchorParam yerel günü YYYY-MM-DD yazar", () => {
    expect(anchorParam(d(2026, 9, 5))).toBe("2026-09-05");
  });
});

describe("paymentDueDate ve monthsInRange", () => {
  it("vade, ödeme örneğinin ayı ve planın tahsilat günüdür", () => {
    expect(paymentDueDate(2026, 9, 15)).toEqual(d(2026, 9, 15));
  });

  it("hafta iki aya yayılıyorsa her iki ayı da döner", () => {
    const { start, end } = rangeFor("week", d(2026, 9, 30)); // 28 Eylül - 5 Ekim
    expect(monthsInRange(start, end)).toEqual([
      { year: 2026, month: 9 },
      { year: 2026, month: 10 },
    ]);
  });

  it("yıl sınırını geçer", () => {
    const { start, end } = rangeFor("week", d(2026, 12, 31)); // 28 Aralık - 3 Ocak
    expect(monthsInRange(start, end)).toEqual([
      { year: 2026, month: 12 },
      { year: 2027, month: 1 },
    ]);
  });

  it("tek günlük aralık tek ay döner", () => {
    const { start, end } = rangeFor("day", d(2026, 9, 20));
    expect(monthsInRange(start, end)).toEqual([{ year: 2026, month: 9 }]);
  });
});
