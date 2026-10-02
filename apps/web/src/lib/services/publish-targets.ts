import { assertSelectable } from "@/lib/services/option-service";

/** Görev ve çekimlerde "Nerede paylaşılacak" (ve ekipman) için ortak seçim alanları. */
export const childOptionSelect = {
  select: { id: true, label: true, kind: true, sortOrder: true, parent: { select: { id: true, label: true, sortOrder: true } } },
} as const;

type Row = { id: string; sortOrder: number; parent: { id: string; sortOrder: number } | null };

/**
 * Üst seçeneğe göre gruplar: önce üst seçeneğin kendisi, sonra alt seçenekler kendi sırasıyla
 * ("Instagram, Instagram · Reels, Instagram · Hikaye, YouTube · Shorts").
 */
export function orderByParent<T extends Row>(rows: T[]): T[] {
  const key = (t: Row) => (t.parent ? [t.parent.sortOrder, t.parent.id, 1, t.sortOrder] : [t.sortOrder, t.id, 0, 0]);
  return [...rows].sort((a, b) => {
    const [ka, kb] = [key(a), key(b)];
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
    }
    return 0;
  });
}

/** Paylaşım yerlerini tekrarsız yapar ve her birinin platform veya paylaşım türü olduğunu doğrular. */
export async function resolvePublishTargets(ids: string[], keepIds: string[] = []) {
  const unique = [...new Set(ids.filter(Boolean))];
  for (const id of unique) {
    await assertSelectable(id, ["PLATFORM", "POST_FORMAT"], keepIds);
  }
  return unique.map((id) => ({ id }));
}
