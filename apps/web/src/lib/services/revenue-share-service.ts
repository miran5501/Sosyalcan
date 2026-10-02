import { prisma } from "@/lib/prisma";
import { monthlySummary } from "@/lib/services/finance-service";
import type { PartnersInput } from "@/lib/validations/settings";

export type ShareBasis = "net" | "gross";

export async function listPartners() {
  return prisma.partner.findMany({ orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
}

/** Ortak listesini bütün olarak değiştirir; toplamın %100 olması validasyon katmanında garanti edilir. */
export async function replacePartners(partners: PartnersInput) {
  return prisma.$transaction(async (tx) => {
    await tx.partner.deleteMany();
    await tx.partner.createMany({
      data: partners.map((p, index) => ({ name: p.name, sharePercent: p.sharePercent, position: index })),
    });
    return tx.partner.findMany({ orderBy: { position: "asc" } });
  });
}

/**
 * Bir ayın gelirini ortaklara oranlarına göre dağıtır. Tutarlar kuruş
 * (integer) olduğu için her pay aşağı yuvarlanır, kalan kuruşlar ilk
 * ortağa eklenir — böylece paylar toplamı her zaman dağıtılan tutara eşit.
 * Dağıtılacak tutar sıfır veya negatifse (zarar) kimseye pay düşmez.
 */
export function splitAmount(baseKurus: number, partners: { name: string; sharePercent: number }[]) {
  const distributable = Math.max(baseKurus, 0);
  const shares = partners.map((p) => ({
    name: p.name,
    sharePercent: p.sharePercent,
    amountKurus: Math.floor((distributable * p.sharePercent) / 100),
  }));
  const remainder = distributable - shares.reduce((sum, s) => sum + s.amountKurus, 0);
  if (shares.length > 0) {
    shares[0].amountKurus += remainder;
  }
  return shares;
}

export async function calculateRevenueShare(year: number, month: number, basis: ShareBasis = "net") {
  const [summary, partners] = await Promise.all([monthlySummary(year, month), listPartners()]);
  const baseKurus = basis === "gross" ? summary.incomeKurus : summary.netKurus;
  return {
    year,
    month,
    basis,
    baseKurus,
    shares: splitAmount(baseKurus, partners),
  };
}
