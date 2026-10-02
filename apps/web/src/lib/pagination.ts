/**
 * Sayfalama: büyük listeler (müşteriler, çekimler) tek seferde değil sayfa sayfa yüklenir.
 * Yıllar içinde binlerce kayıt birikse de sayfa hızı değişmez.
 */
export const DEFAULT_PAGE_SIZE = 25;

/** URL'deki ?page= değerini güvenli sayıya çevirir (geçersizse 1). */
export function parsePage(value: string | undefined | null): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 100_000 ? n : 1;
}

export type Page<T> = { items: T[]; total: number; page: number; pageSize: number; pageCount: number };

export function pageArgs(page: number, pageSize = DEFAULT_PAGE_SIZE) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function toPage<T>(items: T[], total: number, page: number, pageSize = DEFAULT_PAGE_SIZE): Page<T> {
  return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}
