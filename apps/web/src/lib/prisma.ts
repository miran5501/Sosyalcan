// Saat dilimi her şeyden önce sabitlenir (bkz. lib/timezone.ts).
import "@/lib/timezone";
import { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { computeChanges, describeChange, isAuditedOperation } from "@/lib/audit-changes";
import { CACHE_TAGS_BY_MODEL, invalidateCache } from "@/lib/cache";

/**
 * Uygulamanın tek Prisma istemcisi.
 *
 * Üzerine bir "query extension" eklenir: iş verisinde yapılan her oluşturma,
 * güncelleme ve silme otomatik olarak denetim kaydına (audit_logs) yazılır.
 * Web formu (server action), API route ya da mobil, hangi yoldan gelirse
 * gelsin kayıt düşer; tek tek her uç noktaya kod eklemek gerekmez.
 *
 * Aynı katman, önbelleğe alınan tablolar (seçenekler, ajans ayarları) değişince
 * ilgili Redis önbelleğini de geçersiz kılar (bkz. lib/cache.ts).
 *
 * İşlemi yapan kullanıcı o anki istekten (çerez ya da Bearer token) bulunur.
 * İstek dışında (seed, test, cron) kullanıcı boş kalır.
 */
const globalForPrisma = globalThis as unknown as {
  prismaBase: PrismaClient | undefined;
  auditQueue: Set<Promise<void>> | undefined;
};

const base = globalForPrisma.prismaBase ?? new PrismaClient();
const auditQueue = (globalForPrisma.auditQueue ??= new Set());

async function currentActor(): Promise<{ userId: string | null; ip: string | null }> {
  try {
    // Döngüsel içe aktarmayı önlemek için geç yüklenir (api-auth → prisma).
    const { requireSession, requestMeta } = await import("@/lib/api-auth");
    const [session, meta] = await Promise.all([requireSession({ allowMustChangePassword: true }), requestMeta()]);
    return { userId: session.user.id, ip: meta.ip };
  } catch {
    return { userId: null, ip: null };
  }
}

/** Tek kayıtlık güncelleme/silmede "eski" değerleri okumak için (aynı where ile). */
const SINGLE_RECORD_OPS = new Set(["update", "upsert", "delete"]);

async function readBefore(model: string, args: unknown): Promise<Record<string, unknown> | null> {
  const where = (args as { where?: unknown }).where;
  if (!where) return null;
  const delegate = (base as unknown as Record<string, { findUnique?: (a: unknown) => Promise<unknown> }>)[
    model.charAt(0).toLowerCase() + model.slice(1)
  ];
  try {
    return ((await delegate?.findUnique?.({ where })) as Record<string, unknown> | null) ?? null;
  } catch {
    return null;
  }
}

export const prisma = base.$extends({
  name: "audit-log",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const audited = isAuditedOperation(model, operation, args);
        // Kişi değişiklikten ÖNCE bulunur: şifre değişikliği oturum sürümünü artırdığında
        // sonradan bakılırsa oturum geçersiz görünür ve kayıt kişisiz kalırdı.
        const actor = audited ? await currentActor() : null;
        // "Eski → yeni" için değişiklikten önceki hâl (transaction içindeyse son commit edilmiş hâl).
        const before = audited && model && SINGLE_RECORD_OPS.has(operation) ? await readBefore(model, args) : null;
        const result = await query(args);
        const cacheTag = model ? CACHE_TAGS_BY_MODEL[model] : undefined;
        if (cacheTag && audited) {
          await invalidateCache(cacheTag);
        }
        if (actor) {
          const changes = computeChanges(operation, args, before, result);
          // Önceki hâl okunabildiyse "hiçbir şey değişmedi" de bilgidir: özet gönderilen alanları saymasın.
          const described = describeChange(model, operation, args, result, changes ?? (before ? {} : undefined));
          const entry = described && { ...described, changes };
          if (entry) {
            const { changes, ...rest } = entry;
            const data = { ...rest, changes: (changes ?? Prisma.DbNull) as Prisma.InputJsonValue | typeof Prisma.DbNull };
            // Kayıt beklenmeden yazılır: bir transaction içindeyken aynı kullanıcı satırını
            // kilitleyen işlemle karşılıklı beklemeye (deadlock) girmesin.
            const job = base.auditLog
              .create({ data: { ...data, userId: actor.userId, ip: actor.ip } })
              .then(
                () => undefined,
                // Kullanıcı bu arada silinmişse (FK hatası) kişisiz yaz.
                () => base.auditLog.create({ data: { ...data, ip: actor.ip } }).then(() => undefined, () => undefined),
              )
              .finally(() => auditQueue.delete(job));
            auditQueue.add(job);
          }
        }
        return result;
      },
    },
  },
});

/** Bekleyen denetim kayıtlarının yazılmasını bekler (testler ve kapanış için). */
export async function flushAuditQueue() {
  await Promise.all([...auditQueue]);
}

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaBase = base;
}
