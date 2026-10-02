import type { OptionKind, Role } from "@prisma/client";

/** Admin'in yönettiği seçenek listeleri (Ayarlar → Seçenek Listeleri). */
export const OPTION_KINDS = [
  "SHOOT_TYPE",
  "DELIVERY_STATUS",
  "PLATFORM",
  "POST_FORMAT",
  "TASK_STATUS",
  "EQUIPMENT_CATEGORY",
  "EQUIPMENT",
  "FINANCE_CATEGORY",
  "PAYMENT_METHOD",
  "DELIVERY_CHECKLIST",
] as const;

type KindConfig = {
  title: string;
  single: string;
  hint: string;
  /** Bu tür bir üst seçeneğin altına eklenir (paylaşım türü → platform, ekipman → kategori). */
  parentKind?: OptionKind;
  /** Rozet rengi seçilebilir. */
  hasColor?: boolean;
  /** Listede en az bir aktif seçenek kalmalı (her kayıt bu listeden bir değer taşır). */
  keepOne?: boolean;
  /** "Tamamlandı sayılır" işareti (yalnızca görev durumları). */
  hasDoneFlag?: boolean;
  /**
   * Admin dışında, formdan hızlı ekleme yapabilecek roller (ör. çekim düzenlerken listede olmayan
   * ekipmanı eklemek). Ad değiştirme, sıralama ve kaldırma her zaman yalnızca Admin'dedir.
   */
  quickAddRoles?: Role[];
};

export const OPTION_KIND_CONFIG: Record<OptionKind, KindConfig> = {
  TASK_STATUS: {
    title: "Görev Durumları",
    single: "görev durumu",
    hint: "Kanban sütunları. İlk sıradaki durum yeni görevlerin başlangıç durumudur. \"Tamamlandı sayılır\" işaretli sütundaki görevler ana sayfada bugünkü işler arasında çıkmaz.",
    hasColor: true,
    keepOne: true,
    hasDoneFlag: true,
  },
  SHOOT_TYPE: { title: "Çekim Türleri", single: "çekim türü", hint: "Yeni çekimde \"Tür\" alanında seçilir.", keepOne: true },
  DELIVERY_STATUS: {
    title: "Teslim Durumları",
    single: "teslim durumu",
    hint: "Çekimin hangi aşamada olduğunu gösterir. İlk sıradaki durum yeni çekimlerin başlangıç durumudur.",
    hasColor: true,
    keepOne: true,
  },
  DELIVERY_CHECKLIST: {
    title: "Teslim Kontrol Listesi",
    single: "kontrol maddesi",
    hint: "Her yeni çekime bu maddeler kopyalanır (ör. \"Ham görüntüler yedeklendi\", \"Müşteri onayı alındı\"). Çekim sayfasında tek tek işaretlenir; çekime özel madde de eklenebilir. Buradaki değişiklik var olan çekimleri etkilemez.",
  },
  PLATFORM: {
    title: "Paylaşım Platformları",
    single: "platform",
    hint: "Görev ve çekimlerde \"Nerede paylaşılacak\" alanında seçilir. Her platformun altına kendi paylaşım türlerini ekleyebilirsin.",
  },
  POST_FORMAT: { title: "Paylaşım Türleri", single: "paylaşım türü", hint: "", parentKind: "PLATFORM" },
  EQUIPMENT_CATEGORY: {
    title: "Ekipman",
    single: "ekipman kategorisi",
    hint: "Çekimlerde \"Ekipman\" alanında aranıp seçilir. Operasyon ekibi de çekim formundan listede olmayan ekipmanı ekleyebilir.",
    quickAddRoles: ["ADMIN", "OPERATIONS"],
  },
  EQUIPMENT: { title: "Ekipmanlar", single: "ekipman", hint: "", parentKind: "EQUIPMENT_CATEGORY", quickAddRoles: ["ADMIN", "OPERATIONS"] },
  FINANCE_CATEGORY: {
    title: "Finans Kategorileri",
    single: "finans kategorisi",
    hint: "Gelir/gider kaydında seçilir. Finans ekibi de kayıt formundan yeni kategori ekleyebilir. Geçmiş kayıtlar kategori adını olduğu gibi saklar.",
    quickAddRoles: ["ADMIN", "FINANCE"],
  },
  PAYMENT_METHOD: {
    title: "Ödeme Yöntemleri",
    single: "ödeme yöntemi",
    hint: "Gelir/gider kaydında ve \"ödeme alındı\" işaretlenirken seçilir (ör. nakit, havale). Finans ekibi de formdan ekleyebilir.",
    quickAddRoles: ["ADMIN", "FINANCE"],
  },
};

/** Geriye dönük ad: sayfalar başlık/ipucu için kullanır. */
export const OPTION_KIND_LABELS = OPTION_KIND_CONFIG;

/** Yönetim sayfasının sekmeleri ve her sekmedeki listeler. */
export const OPTION_TABS = [
  { key: "tasks", label: "Görevler", kinds: ["TASK_STATUS"] },
  { key: "shoots", label: "Çekimler", kinds: ["SHOOT_TYPE", "DELIVERY_STATUS", "DELIVERY_CHECKLIST"] },
  { key: "publish", label: "Paylaşım", kinds: ["PLATFORM"] },
  { key: "equipment", label: "Ekipman", kinds: ["EQUIPMENT_CATEGORY"] },
  { key: "finance", label: "Finans", kinds: ["FINANCE_CATEGORY", "PAYMENT_METHOD"] },
] as const satisfies readonly { key: string; label: string; kinds: readonly OptionKind[] }[];

export type OptionTab = (typeof OPTION_TABS)[number]["key"];

/**
 * Rozet renkleri. Tailwind sınıfları derleme anında taranır, bu yüzden sınıf adları burada tam
 * metin olarak durmalı (dinamik birleştirme yapılmaz). Veritabanında yalnızca anahtar tutulur.
 */
export const OPTION_COLORS = {
  neutral: { label: "Gri", badge: "bg-neutral-100 text-neutral-600", dot: "bg-neutral-400" },
  blue: { label: "Mavi", badge: "bg-blue-50 text-blue-700", dot: "bg-blue-500" },
  amber: { label: "Turuncu", badge: "bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  green: { label: "Yeşil", badge: "bg-green-50 text-green-700", dot: "bg-green-500" },
  red: { label: "Kırmızı", badge: "bg-red-50 text-red-700", dot: "bg-red-500" },
  purple: { label: "Mor", badge: "bg-purple-50 text-purple-700", dot: "bg-purple-500" },
} as const;

export type OptionColor = keyof typeof OPTION_COLORS;
export const OPTION_COLOR_KEYS = Object.keys(OPTION_COLORS) as OptionColor[];

const colorOf = (color?: string | null) => OPTION_COLORS[(color ?? "neutral") as OptionColor] ?? OPTION_COLORS.neutral;
export const badgeClass = (color?: string | null) => colorOf(color).badge;
export const dotClass = (color?: string | null) => colorOf(color).dot;

/**
 * Migration'ların eski enum değerlerinden oluşturduğu başlangıç seçenekleri (kimlikler migration
 * SQL'iyle aynı). Test veritabanı her testte boşaltıldığı için testler bunları yeniden ekler.
 */
export const DEFAULT_OPTIONS = [
  { id: "opt_type_video", kind: "SHOOT_TYPE", label: "Video", color: null, isDone: false, sortOrder: 0 },
  { id: "opt_type_drone", kind: "SHOOT_TYPE", label: "Drone", color: null, isDone: false, sortOrder: 1 },
  { id: "opt_type_other", kind: "SHOOT_TYPE", label: "Diğer", color: null, isDone: false, sortOrder: 2 },
  { id: "opt_status_planned", kind: "DELIVERY_STATUS", label: "Planlandı", color: "neutral", isDone: false, sortOrder: 0 },
  { id: "opt_status_shot", kind: "DELIVERY_STATUS", label: "Çekildi", color: "blue", isDone: false, sortOrder: 1 },
  { id: "opt_status_editing", kind: "DELIVERY_STATUS", label: "Kurguda", color: "amber", isDone: false, sortOrder: 2 },
  { id: "opt_status_delivered", kind: "DELIVERY_STATUS", label: "Teslim Edildi", color: "green", isDone: false, sortOrder: 3 },
  { id: "opt_task_waiting", kind: "TASK_STATUS", label: "Bekliyor", color: "neutral", isDone: false, sortOrder: 0 },
  { id: "opt_task_editing", kind: "TASK_STATUS", label: "Kurguda", color: "amber", isDone: false, sortOrder: 1 },
  { id: "opt_task_revision", kind: "TASK_STATUS", label: "Revizede", color: "blue", isDone: false, sortOrder: 2 },
  { id: "opt_task_done", kind: "TASK_STATUS", label: "Tamamlandı", color: "green", isDone: true, sortOrder: 3 },
  { id: "opt_check_backup", kind: "DELIVERY_CHECKLIST", label: "Ham görüntüler yedeklendi", color: null, isDone: false, sortOrder: 0 },
  { id: "opt_check_edit", kind: "DELIVERY_CHECKLIST", label: "Kurgu tamamlandı", color: null, isDone: false, sortOrder: 1 },
  { id: "opt_check_approval", kind: "DELIVERY_CHECKLIST", label: "Müşteri onayı alındı", color: null, isDone: false, sortOrder: 2 },
  { id: "opt_check_link", kind: "DELIVERY_CHECKLIST", label: "Teslim linki paylaşıldı", color: null, isDone: false, sortOrder: 3 },
] as const;

/** Yayın hedefinin / ekipmanın okunur adı: alt seçenekse "Üst · Ad", değilse yalnızca adı. */
export function targetLabel(option: { label: string; parent?: { label: string } | null }) {
  return option.parent ? `${option.parent.label} · ${option.label}` : option.label;
}
