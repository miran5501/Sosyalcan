/**
 * Uygulamanın saat dilimi.
 *
 * "Bugün", "yarın", "vadesi geçti", ay sınırları ve ekrandaki saatler sunucunun yerel saatine göre
 * hesaplanır. Bulut sunucuları (Vercel, Docker) çoğunlukla UTC çalışır: İstanbul'dan 3 saat geride
 * olduğu için gece 00:00–03:00 arası yanlış güne düşülür, çekim saatleri kayar. Bu yüzden sunucu
 * süreci açılır açılmaz saat dilimi sabitlenir (Node.js `process.env.TZ` değişikliğini hemen uygular).
 *
 * Varsayılan Europe/Istanbul; başka bir ülkede çalışacaksa APP_TIME_ZONE ile değiştirilir.
 */
export const APP_TIME_ZONE = process.env.APP_TIME_ZONE || "Europe/Istanbul";

export function applyAppTimeZone() {
  if (process.env.TZ !== APP_TIME_ZONE) {
    process.env.TZ = APP_TIME_ZONE;
  }
}

// İçe aktarıldığı anda uygulanır (prisma.ts ve instrumentation.ts bu dosyayı en başta yükler).
applyAppTimeZone();
