import { prisma } from "@/lib/prisma";
import { cached } from "@/lib/cache";
import type { AgencySettingsInput } from "@/lib/validations/agency";

export const DEFAULT_AGENCY_NAME = "SosyalCan Komuta Merkezi";
const SINGLETON_ID = "singleton";

/** Ajans bilgileri (menüde gösterilir). Hiç kaydedilmemişse varsayılan ad döner. */
export async function getAgencySettings() {
  // Her sayfanın menüsünde okunur; değişince Prisma katmanı önbelleği temizler.
  return cached("agency", "settings", 300, async () => {
    const row = await prisma.agencySettings.findUnique({ where: { id: SINGLETON_ID } });
    return { name: row?.name ?? DEFAULT_AGENCY_NAME, logoUrl: row?.logoUrl ?? null };
  });
}

/** Tek satırlık ayarı oluşturur/günceller; boş logo adresi logoyu kaldırır. */
export async function updateAgencySettings(input: AgencySettingsInput) {
  const data = { name: input.name, logoUrl: input.logoUrl ? input.logoUrl : null };
  const row = await prisma.agencySettings.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, ...data },
    update: data,
  });
  return { name: row.name, logoUrl: row.logoUrl };
}
