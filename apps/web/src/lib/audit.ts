import { prisma } from "@/lib/prisma";

/**
 * Denetim kaydı (audit log): güvenlik açısından önemli olayları ve kritik
 * veri değişikliklerini "kim, ne zaman, neyi" olarak saklar.
 *
 * Kayıt yazılamazsa asıl işlem bozulmaz: hata loglanır, istek devam eder.
 */
export const AUDIT_ACTIONS = {
  LOGIN_SUCCESS: "Giriş yapıldı",
  LOGIN_FAILED: "Hatalı giriş denemesi",
  LOGIN_LOCKED: "Giriş kilitlendi",
  LOGOUT: "Çıkış yapıldı",
  TOKEN_REUSE: "Çalıntı token şüphesi",
  TWO_FACTOR_FAILED: "Hatalı 2FA kodu",
  PASSWORD_RESET_REQUESTED: "Şifre sıfırlama istendi",
  PASSWORD_RESET_COMPLETED: "Şifre sıfırlandı",
  DATA_EXPORTED: "Kişisel veri indirildi",
  ANONYMIZED: "KVKK: anonimleştirildi",
  CREATE: "Kayıt oluşturuldu",
  UPDATE: "Kayıt güncellendi",
  DELETE: "Kayıt silindi/arşivlendi",
} as const;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

export type AuditEntry = {
  action: AuditAction;
  userId?: string | null;
  entity?: string;
  entityId?: string;
  summary?: string;
  ip?: string | null;
};

/**
 * Güvenlik olayını (giriş, çıkış, kilit, token kötüye kullanımı) yazar.
 * Veri değişiklikleri ayrıca otomatik yazılır (lib/prisma.ts + audit-changes.ts).
 */
export async function audit(entry: AuditEntry): Promise<void> {
  const data = {
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    summary: entry.summary?.slice(0, 500),
    ip: entry.ip ?? null,
  };
  try {
    await prisma.auditLog.create({ data: { ...data, userId: entry.userId ?? null } });
  } catch {
    try {
      // Kullanıcı bulunamadıysa (FK) kişisiz yaz.
      await prisma.auditLog.create({ data });
    } catch (error) {
      console.error("[audit] kayıt yazılamadı", error);
    }
  }
}

export const AUDIT_PAGE_SIZE = 50;

export async function listAuditLogs(filter: { page?: number; action?: string; userId?: string }) {
  const page = Math.max(1, filter.page ?? 1);
  const where = {
    ...(filter.action ? { action: filter.action } : {}),
    ...(filter.userId ? { userId: filter.userId } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { items, total, page, pageCount: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)) };
}
