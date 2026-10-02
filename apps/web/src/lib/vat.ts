/**
 * KDV (katma değer vergisi). Finans kayıtlarında girilen tutar KDV DAHİL tutardır (faturadaki
 * "genel toplam"); KDV payı oradan ayrıştırılır ve kuruş olarak tam sayı saklanır (float yok).
 *
 *   KDV = tutar × oran / (100 + oran)      (en yakın kuruşa yuvarlanır)
 *   ör. 1.200,00 TL, %20 → KDV 200,00 TL, matrah 1.000,00 TL
 */
export const VAT_RATES = [0, 1, 10, 20] as const;

export function vatFromGross(amountKurus: number, ratePercent: number): number {
  if (!Number.isInteger(amountKurus) || amountKurus < 0) {
    throw new Error("Tutar pozitif tam sayı (kuruş) olmalı");
  }
  if (!Number.isInteger(ratePercent) || ratePercent < 0 || ratePercent > 100) {
    throw new Error("KDV oranı 0–100 arası tam sayı olmalı");
  }
  if (ratePercent === 0) return 0;
  // Tam sayı aritmetiği: (a·r·2 + (100+r)) / (2·(100+r)) aşağı yuvarlama = en yakın kuruşa yuvarlama.
  const denominator = 100 + ratePercent;
  return Math.floor((amountKurus * ratePercent * 2 + denominator) / (2 * denominator));
}

/** KDV hariç tutar (matrah). */
export function netOfVat(amountKurus: number, ratePercent: number): number {
  return amountKurus - vatFromGross(amountKurus, ratePercent);
}

/** Bir dönemin KDV özeti: gelirlerdeki (hesaplanan) − giderlerdeki (indirilecek) = ödenecek KDV. */
export function vatSummary(rows: { type: "INCOME" | "EXPENSE"; vatAmount: number | null }[]) {
  const collected = rows.filter((r) => r.type === "INCOME").reduce((sum, r) => sum + (r.vatAmount ?? 0), 0);
  const paid = rows.filter((r) => r.type === "EXPENSE").reduce((sum, r) => sum + (r.vatAmount ?? 0), 0);
  return { vatCollectedKurus: collected, vatPaidKurus: paid, vatPayableKurus: collected - paid };
}
