import { formatKurusAsTL } from "@/lib/money";

/**
 * Prisma işlemlerini okunur denetim kaydı satırlarına çevirir (bkz. lib/prisma.ts).
 * Özet satırında değişen alanların adı, `changes` alanında eski → yeni değerleri tutulur.
 * Şifre özeti ve token gibi gizli alanların değeri hiçbir zaman yazılmaz (maskelenir).
 */
const MUTATIONS = new Set(["create", "createMany", "createManyAndReturn", "update", "updateMany", "upsert", "delete", "deleteMany"]);

/** Denetim kaydına girmeyen modeller: kaydın kendisi ve oturum token'ları (gürültü). */
const SKIPPED_MODELS = new Set(["AuditLog", "RefreshToken", "Notification", "EmailMessage", "JobRun", "PasswordResetToken", "ErrorEvent", "KnownDevice"]);

/** Kullanıcıda yalnızca bu alanlar değişiyorsa kayıt yazılmaz (her girişte güncellenir). */
const SILENT_USER_FIELDS = new Set(["lastLoginAt", "totpLastStep", "emailOtpHash", "emailOtpExpiresAt"]);

export const ENTITY_LABELS: Record<string, string> = {
  User: "Kullanıcı",
  Customer: "Müşteri",
  Task: "Görev",
  TaskComment: "Görev yorumu",
  TaskLink: "Görev bağlantısı",
  AgencySettings: "Ajans ayarları",
  OptionItem: "Seçenek",
  Shoot: "Çekim",
  Appointment: "Randevu",
  Transaction: "Finans kaydı",
  PaymentPlan: "Ödeme planı",
  PaymentInstance: "Ödeme",
  Partner: "Ortak",
  ShootChecklistItem: "Çekim kontrol maddesi",
  NotificationPreference: "Bildirim tercihi",
  Attachment: "Dosya",
};

export const FIELD_LABELS: Record<string, string> = {
  name: "ad",
  fileName: "dosya adı",
  title: "başlık",
  label: "etiket",
  description: "açıklama",
  email: "e-posta",
  role: "rol",
  passwordHash: "şifre",
  disabledAt: "hesap durumu",
  amount: "tutar",
  monthlyAmount: "aylık tutar",
  category: "kategori",
  counterparty: "kime/kimden",
  occurredAt: "tarih",
  scheduledAt: "tarih",
  startsAt: "başlangıç",
  endsAt: "bitiş",
  dueDate: "teslim tarihi",
  statusId: "durum",
  status: "durum",
  priority: "öncelik",
  assigneeId: "atanan kişi",
  customerId: "müşteri",
  location: "yer",
  billingDay: "ödeme günü",
  sharePercent: "pay oranı",
  paidAt: "ödeme tarihi",
  paymentMethodId: "ödeme yöntemi",
  deliveryStatusId: "teslim durumu",
  typeId: "tür",
  tags: "etiketler",
  contact: "iletişim",
  notes: "notlar",
  brief: "brief",
  equipment: "ekipman notu",
  deliveryLink: "teslim bağlantısı",
  url: "adres",
  body: "metin",
  color: "renk",
  sortOrder: "sıra",
  isDone: "tamamlandı sayılır",
  parentId: "üst seçenek",
  logoUrl: "logo",
  type: "tür",
  kind: "liste",
  archivedAt: "arşiv",
  mustChangePassword: "şifre değiştirmeli",
  totpSecret: "2FA anahtarı",
  totpPendingSecret: "2FA kurulum anahtarı",
  twoFactorEnabledAt: "2FA açılma zamanı",
  twoFactorMethod: "2FA yöntemi",
  recoveryCodes: "2FA kurtarma kodları",
  anonymizedAt: "anonimleştirme",
  privacyNotice: "KVKK metni",
  done: "tamamlandı",
  revisionCount: "revizyon sayısı",
  vatRate: "KDV oranı",
  vatAmount: "KDV tutarı",
  invoiceNo: "fatura no",
  month: "ay",
};

/** Değeri asla kayda yazılmayan alanlar. */
const SECRET_FIELDS = new Set(["passwordHash", "tokenHash", "totpSecret", "totpPendingSecret", "recoveryCodes", "emailOtpHash"]);
/** Değişse de "eski → yeni" listesine konmayan teknik alanlar. */
const TECHNICAL_FIELDS = new Set(["id", "createdAt", "updatedAt", "sessionVersion", "passwordChangedAt", "lastLoginAt", "totpLastStep", "emailOtpExpiresAt"]);
export const MONEY_FIELDS = new Set(["amount", "monthlyAmount", "vatAmount"]);
export const MASK = "••••••";

export type FieldChange = { from?: unknown; to?: unknown };
export type ChangeMap = Record<string, FieldChange>;

function isScalar(value: unknown) {
  return value === null || value instanceof Date || typeof value !== "object" || Array.isArray(value);
}

function plain(field: string, value: unknown): unknown {
  if (SECRET_FIELDS.has(field)) return MASK;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.length > 200) return `${value.slice(0, 200)}…`;
  return value;
}

function same(a: unknown, b: unknown) {
  return JSON.stringify(plain("", a)) === JSON.stringify(plain("", b));
}

/**
 * Eski/yeni değer haritası:
 * - create: kaydın dolu alanları (yalnızca "to")
 * - delete: silinen kaydın alanları (yalnızca "from")
 * - update/upsert: gönderilen ve gerçekten değişen alanlar ("from" → "to")
 * İlişki işlemleri (ör. ekipman listesi `set`) değer olarak değil "(liste güncellendi)" diye yazılır.
 */
export function computeChanges(
  operation: string,
  args: unknown,
  before: Record<string, unknown> | null,
  result: unknown,
): ChangeMap | undefined {
  const after = (result && typeof result === "object" && !Array.isArray(result) ? result : null) as Record<string, unknown> | null;
  const changes: ChangeMap = {};

  if (operation === "create" && after) {
    for (const [field, value] of Object.entries(after)) {
      if (TECHNICAL_FIELDS.has(field) || value === null || !isScalar(value)) continue;
      if (Array.isArray(value) && value.length === 0) continue;
      changes[field] = { to: plain(field, value) };
    }
  } else if (operation === "delete" && before) {
    for (const [field, value] of Object.entries(before)) {
      if (TECHNICAL_FIELDS.has(field) || value === null || !isScalar(value)) continue;
      changes[field] = { from: plain(field, value) };
    }
  } else if ((operation === "update" || operation === "upsert") && before) {
    const data = ((args as { data?: unknown; update?: unknown }).data ?? (args as { update?: unknown }).update ?? {}) as Record<string, unknown>;
    for (const [field, sent] of Object.entries(data)) {
      if (TECHNICAL_FIELDS.has(field)) continue;
      if (!isScalar(sent) && !(sent && typeof sent === "object" && ("increment" in sent || "decrement" in sent || "set" in sent) && field in before)) {
        changes[field] = { to: "(liste güncellendi)" };
        continue;
      }
      // Sonuçta alan yoksa (select ile daraltılmış) gönderilen düz değer kullanılır.
      const next = after && field in after ? after[field] : isScalar(sent) ? sent : undefined;
      if (next === undefined || !(field in before)) continue;
      if (SECRET_FIELDS.has(field)) {
        changes[field] = { from: MASK, to: MASK };
      } else if (!same(before[field], next)) {
        changes[field] = { from: plain(field, before[field]), to: plain(field, next) };
      }
    }
  }
  return Object.keys(changes).length > 0 ? changes : undefined;
}

type Args = { data?: unknown; where?: unknown; create?: unknown; update?: unknown };

function dataKeys(args: Args): string[] {
  const data = (args.data ?? args.update ?? {}) as Record<string, unknown>;
  return Array.isArray(data) ? [] : Object.keys(data).filter((k) => k !== "updatedAt");
}

export function isAuditedOperation(model: string | undefined, operation: string, args: unknown): boolean {
  if (!model || SKIPPED_MODELS.has(model) || !MUTATIONS.has(operation)) {
    return false;
  }
  if (model === "User" && (operation === "update" || operation === "updateMany")) {
    const keys = dataKeys(args as Args);
    if (keys.length > 0 && keys.every((k) => SILENT_USER_FIELDS.has(k))) {
      return false;
    }
  }
  return true;
}

function titleOf(model: string, record: Record<string, unknown> | null | undefined): string | undefined {
  if (!record) return undefined;
  if (model === "Transaction" && typeof record.amount === "number") {
    const kind = record.type === "INCOME" ? "Gelir" : "Gider";
    const what = (record.description as string) || (record.category as string) || "";
    return `${kind} ${formatKurusAsTL(record.amount)}${what ? ` · ${what}` : ""}`;
  }
  if (model === "PaymentInstance" && typeof record.amount === "number") {
    return `${formatKurusAsTL(record.amount)}${record.status ? ` · ${record.status}` : ""}`;
  }
  if (model === "User") {
    return [record.name, record.email].filter(Boolean).join(" · ") || undefined;
  }
  const text = record.name ?? record.title ?? record.label ?? record.url ?? record.body ?? record.location;
  return typeof text === "string" ? text.slice(0, 80) : undefined;
}

function fieldList(keys: string[]): string {
  return [...new Set(keys.map((k) => FIELD_LABELS[k] ?? k))].join(", ");
}

export type ChangeEntry = {
  action: "CREATE" | "UPDATE" | "DELETE";
  entity: string;
  entityId?: string;
  summary?: string;
  changes?: ChangeMap;
};

/**
 * İşlemin denetim kaydı karşılığı; yazmaya değmeyecek bir şeyse (0 satır etkilendi) null.
 * `changes` verilirse (eski/yeni değerler hesaplandıysa) özet yalnızca GERÇEKTEN değişen alanları sayar;
 * yoksa gönderilen alanları sayar (ör. formdan gelen ama aynı kalan alanlar).
 */
export function describeChange(model: string, operation: string, args: unknown, result: unknown, changes?: ChangeMap): ChangeEntry | null {
  const entity = ENTITY_LABELS[model] ?? model;
  const record = (result && typeof result === "object" && !Array.isArray(result) ? result : null) as Record<string, unknown> | null;
  const entityId = typeof record?.id === "string" ? record.id : undefined;
  const title = titleOf(model, record);
  const a = args as Args;

  if (operation === "createMany" || operation === "updateMany" || operation === "deleteMany" || operation === "createManyAndReturn") {
    const count = Array.isArray(result) ? result.length : Number((result as { count?: number })?.count ?? 0);
    if (count === 0) return null;
    const action = operation.startsWith("create") ? "CREATE" : operation === "deleteMany" ? "DELETE" : "UPDATE";
    const keys = operation === "updateMany" ? dataKeys(a) : [];
    return { action, entity, summary: `${count} kayıt${keys.length ? ` · ${fieldList(keys)}` : ""}` };
  }

  if (operation === "create") {
    return { action: "CREATE", entity, entityId, summary: title };
  }
  if (operation === "delete") {
    return { action: "DELETE", entity, entityId, summary: title ? `${title} · kalıcı silindi` : "kalıcı silindi" };
  }

  // update / upsert
  const data = (a.data ?? a.update ?? {}) as Record<string, unknown>;
  if ("archivedAt" in data) {
    const archived = data.archivedAt !== null;
    return {
      action: archived ? "DELETE" : "UPDATE",
      entity,
      entityId,
      summary: [title, archived ? "arşivlendi" : "arşivden geri alındı"].filter(Boolean).join(" · "),
    };
  }
  if (model === "User" && "disabledAt" in data) {
    const disabled = data.disabledAt !== null;
    return { action: "UPDATE", entity, entityId, summary: [title, disabled ? "hesap kapatıldı" : "hesap açıldı"].filter(Boolean).join(" · ") };
  }
  const allKeys = dataKeys(a);
  const keys = (changes ? Object.keys(changes) : allKeys).filter((k) => k !== "sessionVersion" && k !== "passwordChangedAt");
  if (model === "User" && keys.length === 0 && allKeys.includes("sessionVersion")) {
    return { action: "UPDATE", entity, entityId, summary: [title, "tüm oturumları kapatıldı"].filter(Boolean).join(" · ") };
  }
  return {
    action: "UPDATE",
    entity,
    entityId,
    summary: [title, keys.length ? `değişen: ${fieldList(keys)}` : null].filter(Boolean).join(" · ") || undefined,
  };
}
