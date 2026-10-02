import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { resetDb } from "@/test/db-helpers";
import { agencySettingsSchema } from "@/lib/validations/agency";
import { DEFAULT_AGENCY_NAME, getAgencySettings, updateAgencySettings } from "./agency-service";

beforeEach(resetDb);

describe("ajans bilgileri", () => {
  it("hiç kaydedilmemişse varsayılan adı döner, logo yoktur", async () => {
    expect(await getAgencySettings()).toEqual({ name: DEFAULT_AGENCY_NAME, logoUrl: null });
  });

  it("kaydedilen ad ve logo geri okunur", async () => {
    await updateAgencySettings({ name: "Bulut Medya", logoUrl: "https://ornek.com/logo.png" });
    expect(await getAgencySettings()).toEqual({ name: "Bulut Medya", logoUrl: "https://ornek.com/logo.png" });
  });

  it("tekrar kaydetmek yeni satır açmaz, tek satır güncellenir", async () => {
    await updateAgencySettings({ name: "Bir" + "inci" });
    await updateAgencySettings({ name: "İkinci" });
    expect(await prisma.agencySettings.count()).toBe(1);
    expect((await getAgencySettings()).name).toBe("İkinci");
  });

  it("boş logo adresi logoyu kaldırır; logo hiç verilmezse null kalır", async () => {
    await updateAgencySettings({ name: "Bulut Medya", logoUrl: "https://ornek.com/logo.png" });
    await updateAgencySettings({ name: "Bulut Medya", logoUrl: "" });
    expect((await getAgencySettings()).logoUrl).toBeNull();

    await resetDb();
    await updateAgencySettings({ name: "Bulut Medya" });
    expect((await getAgencySettings()).logoUrl).toBeNull();
  });
});

describe("agencySettingsSchema", () => {
  it("adı kırpar, çok kısa/uzun adı reddeder", () => {
    expect(agencySettingsSchema.parse({ name: "  Bulut Medya  " }).name).toBe("Bulut Medya");
    expect(agencySettingsSchema.safeParse({ name: "A" }).success).toBe(false);
    expect(agencySettingsSchema.safeParse({ name: "a".repeat(61) }).success).toBe(false);
  });

  it("logo adresi yalnızca http(s) olabilir (boş kabul edilir)", () => {
    for (const logoUrl of ["", "https://ornek.com/a.png", "http://ornek.com/a.png"]) {
      expect(agencySettingsSchema.safeParse({ name: "Bulut", logoUrl }).success).toBe(true);
    }
    for (const logoUrl of ["javascript:alert(1)", "data:image/png;base64,AAAA", "ornek.com/logo.png", "https://a b.com/x.png"]) {
      expect(agencySettingsSchema.safeParse({ name: "Bulut", logoUrl }).success).toBe(false);
    }
  });
});
