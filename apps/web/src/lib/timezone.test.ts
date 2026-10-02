import { describe, expect, it } from "vitest";
import { APP_TIME_ZONE, applyAppTimeZone } from "./timezone";

describe("uygulama saat dilimi", () => {
  it("sunucu UTC'de çalışsa da tarih hesapları İstanbul saatine göre yapılır", () => {
    process.env.TZ = "UTC"; // ör. Vercel / Docker varsayılanı
    expect(new Date(2026, 9, 1, 0, 0).toISOString()).toBe("2026-10-01T00:00:00.000Z");

    applyAppTimeZone();

    expect(APP_TIME_ZONE).toBe("Europe/Istanbul");
    // İstanbul'da 1 Ekim 00:00 = UTC 30 Eylül 21:00
    expect(new Date(2026, 9, 1, 0, 0).toISOString()).toBe("2026-09-30T21:00:00.000Z");
    // UTC 22:30 (30 Eylül) İstanbul'da zaten 1 Ekim: "bugün" doğru güne düşer
    expect(new Date("2026-09-30T22:30:00Z").getDate()).toBe(1);
  });
});
