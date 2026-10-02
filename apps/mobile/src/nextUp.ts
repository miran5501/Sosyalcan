import type { Appointment, Shoot } from "./types";

export type NextUp = { at: string; title: string; subtitle?: string };

/**
 * Şu andan sonraki en yakın çekim veya randevu. Yalnızca hâlâ başlangıç durumundaki (teslim
 * durumları listesinin ilki, ör. "Planlandı") çekimler "sıradaki" sayılır; zaten çekilmiş olanlar
 * sayılmaz. Başlangıç durumu bilinmiyorsa tüm çekimler aday olur. Uç noktalar `?from=` ile
 * yalnızca gelecekteki kayıtları döner.
 */
export function pickNextUp(shoots: Shoot[], appointments: Appointment[], initialStatusId?: string): NextUp | null {
  const items: NextUp[] = [
    ...shoots
      .filter((s) => !initialStatusId || s.deliveryStatusId === initialStatusId)
      .map((s) => ({
        at: s.scheduledAt,
        title: `${s.type.label} çekimi`,
        // Konum müşteri adıyla aynı yazıldıysa (örn. müşterinin kendi yeri) tekrar etmesin.
        subtitle: [...new Set([s.customer?.name, s.location].filter(Boolean))].join(" · ") || undefined,
      })),
    ...appointments.map((a) => ({ at: a.startsAt, title: a.title, subtitle: a.customer?.name })),
  ];
  // ISO 8601 (UTC) metinleri sözlük sırasıyla zaman sırasındadır.
  items.sort((x, y) => x.at.localeCompare(y.at));
  return items[0] ?? null;
}
