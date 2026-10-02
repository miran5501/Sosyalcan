import { APP_TIME_ZONE } from "@/lib/timezone";

/** Arayüzde kullanılan enum etiketleri (Türkçe) ve renk sınıfları; sayfalar arasında tek kaynak. */
// Görev durumu, çekim türü ve teslim durumu artık admin'in yönettiği seçenekler (bkz. lib/options.ts).
export const PRIORITY_LABELS: Record<string, string> = { LOW: "Düşük", MEDIUM: "Orta", HIGH: "Yüksek" };

export const PAYMENT_STATUS_LABELS: Record<string, string> = { PENDING: "Bekliyor", PAID: "Ödendi", OVERDUE: "Gecikti" };

export const MONTH_NAMES = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

export const formatDateTime = (date: Date) =>
  date.toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: APP_TIME_ZONE });

export const formatDate = (date: Date) =>
  date.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: APP_TIME_ZONE });
