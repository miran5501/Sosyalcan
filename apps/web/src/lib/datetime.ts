/**
 * Form alanları (<input type="datetime-local"> / type="date") ile veritabanındaki tarihler
 * arasında dönüşüm. Uygulama sunucunun yerel saatini kullanır (mevcut formlarla aynı davranış).
 */
const pad = (n: number) => String(n).padStart(2, "0");

/** `<input type="datetime-local">` değeri: yerel "YYYY-MM-DDTHH:mm". */
export function toDateTimeLocalValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * `<input type="date">` değeri. Görev son tarihi form "YYYY-MM-DD" olarak girilir ve
 * `new Date("YYYY-MM-DD")` ile UTC gece yarısı saklanır; geri okurken de UTC günü alınır ki
 * kaydedilen gün saat dilimi yüzünden kaymasın.
 */
export function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Yerel takvim günü anahtarı "YYYY-MM-DD" (takvim gruplaması için). */
export function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
