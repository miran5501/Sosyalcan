import { localDayKey } from "@/lib/datetime";

/** Takvim görünümleri için saf tarih mantığı (saat dilimi: sunucunun yerel saati). */
export type CalendarView = "month" | "week" | "day";

export function parseView(value?: string): CalendarView {
  return value === "week" || value === "day" ? value : "month";
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Haftanın Pazartesi'si (hafta Pazartesi başlar). */
export function startOfWeek(date: Date): Date {
  const day = startOfDay(date);
  const offset = (day.getDay() + 6) % 7; // 0 = Pazartesi
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() - offset);
}

/**
 * Sayfanın "şu an baktığı gün". Yeni bağlantılar `?date=YYYY-MM-DD` kullanır; eski
 * `?month=YYYY-MM` bağlantıları ayın 1'ine gider. Geçersiz/eksik değer bugüne düşer.
 */
export function parseAnchor(params: { date?: string; month?: string }, now: Date = new Date()): Date {
  const full = params.date?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (full) {
    const d = new Date(Number(full[1]), Number(full[2]) - 1, Number(full[3]));
    if (!Number.isNaN(d.getTime()) && d.getMonth() === Number(full[2]) - 1) return d;
  }
  const monthOnly = params.month?.match(/^(\d{4})-(\d{2})$/);
  if (monthOnly && Number(monthOnly[2]) >= 1 && Number(monthOnly[2]) <= 12) {
    return new Date(Number(monthOnly[1]), Number(monthOnly[2]) - 1, 1);
  }
  return startOfDay(now);
}

/** Görünümün kapsadığı aralık: [start, end) (end dahil değil). */
export function rangeFor(view: CalendarView, anchor: Date): { start: Date; end: Date } {
  if (view === "month") {
    return { start: new Date(anchor.getFullYear(), anchor.getMonth(), 1), end: new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1) };
  }
  if (view === "week") {
    const start = startOfWeek(anchor);
    return { start, end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7) };
  }
  const start = startOfDay(anchor);
  return { start, end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1) };
}

/** Önceki (-1) / sonraki (+1) dönem için yeni "bakılan gün". Ay görünümünde ayın 1'i döner. */
export function shiftAnchor(view: CalendarView, anchor: Date, direction: -1 | 1): Date {
  if (view === "month") return new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1);
  const step = view === "week" ? 7 : 1;
  return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + direction * step);
}

/** Bağlantılarda kullanılan `date` değeri. */
export const anchorParam = localDayKey;

/** Ödeme vadesi bir takvim günüdür: ödeme örneğinin ayı + planın tahsilat günü. */
export function paymentDueDate(year: number, month: number, billingDay: number): Date {
  return new Date(year, month - 1, billingDay);
}

/** [start, end) aralığına değen her (yıl, ay) çifti. */
export function monthsInRange(start: Date, end: Date): { year: number; month: number }[] {
  const months: { year: number; month: number }[] = [];
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor < end) {
    months.push({ year: cursor.getFullYear(), month: cursor.getMonth() + 1 });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return months;
}
