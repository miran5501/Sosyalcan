export const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  OPERATIONS: "Operasyon",
  FINANCE: "Finans",
  VIEWER: "Viewer",
};

// Görev durumu, çekim türü ve teslim durumu adları sunucudan gelir (admin web'de yönetir).

/** "Instagram · Reels", "Kamera · Sony A7 IV" gibi okunur adlar. */
export const childLabels = (items: { label: string; parent: { label: string } | null }[] | undefined) =>
  (items ?? []).map((i) => (i.parent ? `${i.parent.label} · ${i.label}` : i.label));
export const PRIORITY_LABELS: Record<string, string> = { HIGH: "Yüksek", MEDIUM: "Orta", LOW: "Düşük" };

export const formatKurusAsTL = (kurus: number) =>
  (kurus / 100).toLocaleString("tr-TR", { style: "currency", currency: "TRY" });

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

/** "YYYY-MM-DD" biçimindeki takvim gününü (saat dilimi dönüşümü olmadan) gösterir. */
export const formatDate = (dateOnly: string) => {
  const [y, m, d] = dateOnly.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("tr-TR", { day: "numeric", month: "long" });
};

/** Tam zaman damgasını (ISO) yerel takvim günü olarak gösterir: "24 Eylül Perşembe". */
export const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" });

/** Bir anın şimdiye göre kalan süresi: "45 dk sonra", "1 sa 35 dk sonra"; 24 saatten uzaksa gün ve saat. */
export function formatUntil(iso: string, now: number = Date.now()) {
  const minutes = Math.round((new Date(iso).getTime() - now) / 60000);
  if (minutes <= 0) return "şimdi";
  if (minutes < 60) return `${minutes} dk sonra`;
  if (minutes < 24 * 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest === 0 ? `${hours} saat sonra` : `${hours} sa ${rest} dk sonra`;
  }
  return `${formatDay(iso)}, ${formatTime(iso)}`;
}

/** Gün gruplaması için yerel "YYYY-MM-DD" anahtarı. */
export const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
