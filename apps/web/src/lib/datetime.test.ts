import { describe, expect, it } from "vitest";
import { localDayKey, toDateInputValue, toDateTimeLocalValue } from "./datetime";

describe("datetime yardımcıları", () => {
  it("toDateTimeLocalValue yerel saati YYYY-MM-DDTHH:mm yazar (tek haneler sıfırla dolar)", () => {
    expect(toDateTimeLocalValue(new Date(2026, 8, 5, 7, 4))).toBe("2026-09-05T07:04");
    expect(toDateTimeLocalValue(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31T23:59");
  });

  it("formdan gelen datetime-local metni yeniden okunup yazılınca aynı kalır", () => {
    const value = "2026-09-21T15:13";
    expect(toDateTimeLocalValue(new Date(value))).toBe(value);
  });

  it("toDateInputValue kaydedilen görev gününü kaydırmadan geri verir", () => {
    const stored = new Date("2026-09-23"); // formdaki type=date değeri böyle saklanır (UTC gece yarısı)
    expect(toDateInputValue(stored)).toBe("2026-09-23");
  });

  it("localDayKey yerel takvim gününü verir", () => {
    expect(localDayKey(new Date(2026, 0, 9, 23, 59))).toBe("2026-01-09");
  });
});
