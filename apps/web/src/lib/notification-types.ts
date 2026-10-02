import type { Role } from "@prisma/client";

/**
 * Bildirim türleri.
 *
 * - **anlık** türler bir olay olunca hemen oluşur; e-postası da hemen gider.
 * - **günlük** türler günde bir kez çalışan hatırlatma işinde oluşur; e-postaları kişi başına
 *   tek bir "günlük özet" e-postasında toplanır (gelen kutusu boğulmasın).
 *
 * `roles` boşsa her rol alabilir; doluysa yalnızca o roller (ör. ödeme bildirimleri finans verisidir:
 * Operasyon ve Viewer hiçbir zaman almaz).
 */
export const NOTIFICATION_TYPES = {
  TASK_ASSIGNED: { label: "Bana görev atandı", delivery: "instant", roles: [] },
  SHOOT_ASSIGNED: { label: "Bana çekim atandı", delivery: "instant", roles: [] },
  APPOINTMENT_INVITED: { label: "Bir randevuya katılımcı olarak eklendim", delivery: "instant", roles: [] },
  TASK_COMMENT: { label: "Görevime yorum yazıldı", delivery: "instant", roles: [] },
  TASK_DUE_SOON: { label: "Görevimin teslim tarihi bugün/yarın", delivery: "daily", roles: [] },
  TASK_OVERDUE: { label: "Görevimin teslim tarihi geçti", delivery: "daily", roles: [] },
  SHOOT_TOMORROW: { label: "Yarın çekimim var", delivery: "daily", roles: [] },
  PAYMENT_DUE_SOON: { label: "Müşteri ödemesinin vadesi yaklaşıyor (3 gün)", delivery: "daily", roles: ["ADMIN", "FINANCE"] },
  PAYMENT_OVERDUE: { label: "Müşteri ödemesi gecikti", delivery: "daily", roles: ["ADMIN", "FINANCE"] },
  NEW_DEVICE_LOGIN: { label: "Hesabıma yeni bir cihazdan giriş yapıldı", delivery: "instant", roles: [] },
  SYSTEM_ERROR: { label: "Sistemde yeni bir hata oluştu", delivery: "instant", roles: ["ADMIN"] },
} as const satisfies Record<string, { label: string; delivery: "instant" | "daily"; roles: readonly Role[] }>;

export type NotificationType = keyof typeof NOTIFICATION_TYPES;
export const NOTIFICATION_TYPE_KEYS = Object.keys(NOTIFICATION_TYPES) as NotificationType[];

/** Bu rol bu bildirim türünü alabilir mi (tercih ekranında da yalnızca bunlar gösterilir). */
export function typeAllowedForRole(type: NotificationType, role: string): boolean {
  const roles = NOTIFICATION_TYPES[type].roles as readonly string[];
  return roles.length === 0 || roles.includes(role);
}
