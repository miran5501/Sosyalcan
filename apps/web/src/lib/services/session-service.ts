import { createHash, randomBytes, randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { ACCESS_TOKEN_TTL_SECONDS, signMobileToken } from "@/lib/mobile-token";

/**
 * Mobil oturumlar: kısa ömürlü access token + uzun ömürlü, tek kullanımlık
 * refresh token.
 *
 * - Refresh token rastgele 256 bit; veritabanında yalnızca SHA-256 özeti tutulur
 *   (DB sızsa bile token'lar kullanılamaz).
 * - Her yenilemede eski token iptal edilir, aynı "aile"de yenisi verilir.
 * - İptal edilmiş bir token tekrar gelirse token çalınmış demektir: bütün aile
 *   iptal edilir, hem saldırgan hem gerçek kullanıcı yeniden giriş yapmak zorunda kalır.
 */
export const REFRESH_TOKEN_TTL_DAYS = 30;

export type ClientMeta = { userAgent?: string | null; ip?: string | null };

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  /** Access token'ın geçerlilik süresi (saniye). */
  expiresIn: number;
};

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

async function createRefreshToken(userId: string, familyId: string, meta: ClientMeta) {
  const raw = randomBytes(32).toString("base64url");
  await prisma.refreshToken.create({
    data: {
      tokenHash: hashToken(raw),
      familyId,
      userId,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
      userAgent: meta.userAgent?.slice(0, 200) ?? null,
      ip: meta.ip ?? null,
    },
  });
  return raw;
}

/** Girişte çağrılır: yeni bir token ailesi başlatır. */
export async function issueTokenPair(
  user: { id: string; sessionVersion: number },
  meta: ClientMeta,
): Promise<TokenPair> {
  const refreshToken = await createRefreshToken(user.id, randomUUID(), meta);
  return {
    accessToken: await signMobileToken(user.id, user.sessionVersion),
    refreshToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  };
}

/**
 * Refresh token'ı yenisiyle değiştirir. Geçersiz/süresi dolmuş/iptal edilmiş
 * token'da ya da hesap devre dışıysa null döner.
 */
export async function rotateRefreshToken(raw: string, meta: ClientMeta) {
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(raw) },
    include: {
      user: {
        select: { id: true, name: true, email: true, role: true, disabledAt: true, sessionVersion: true, mustChangePassword: true },
      },
    },
  });
  if (!existing) {
    return null;
  }

  if (existing.revokedAt) {
    // Çıkışta / oturum kapatmada iptal edilmiş token'ın tekrar gelmesi olağan: sessizce reddet.
    if (!existing.lastUsedAt) {
      return null;
    }
    // Yenilemede zaten kullanılmış token tekrar geldi = çalınma şüphesi: bütün aileyi iptal et.
    await prisma.refreshToken.updateMany({
      where: { familyId: existing.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await audit({
      action: "TOKEN_REUSE",
      userId: existing.userId,
      summary: "İptal edilmiş bir yenileme token'ı tekrar kullanıldı; bu cihazın tüm oturumu kapatıldı",
      ip: meta.ip,
    });
    return null;
  }

  if (existing.expiresAt <= new Date() || existing.user.disabledAt) {
    return null;
  }

  // Aynı token'la eşzamanlı iki yenileme gelirse yalnızca biri kazanır (koşullu güncelleme).
  const claimed = await prisma.refreshToken.updateMany({
    where: { id: existing.id, revokedAt: null },
    data: { revokedAt: new Date(), lastUsedAt: new Date() },
  });
  if (claimed.count === 0) {
    return null;
  }

  const refreshToken = await createRefreshToken(existing.userId, existing.familyId, meta);
  const { user } = existing;
  return {
    accessToken: await signMobileToken(user.id, user.sessionVersion),
    refreshToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, mustChangePassword: user.mustChangePassword },
  };
}

/** Çıkış: bu cihazın token ailesini iptal eder. Bilinmeyen token sessizce yok sayılır. */
export async function revokeRefreshToken(raw: string): Promise<string | null> {
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(raw) } });
  if (!existing) {
    return null;
  }
  await prisma.refreshToken.updateMany({
    where: { familyId: existing.familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return existing.userId;
}

/**
 * Kullanıcının tüm oturumlarını kapatır: web oturumları (sessionVersion artar)
 * ve tüm mobil refresh token'ları. Şifre değişince ve hesap kapatılınca çağrılır.
 */
export async function revokeAllSessions(userId: string) {
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } }),
    prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
}

/** Süresi 7 günden fazla önce dolmuş/iptal edilmiş token kayıtlarını temizler (bakım). */
export async function pruneRefreshTokens() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const { count } = await prisma.refreshToken.deleteMany({
    where: { OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }] },
  });
  return count;
}

/** Kullanıcının açık mobil oturumları (her cihaz için geçerli tek bir refresh token vardır). */
export async function listActiveMobileSessions(userId: string) {
  return prisma.refreshToken.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, createdAt: true, userAgent: true, ip: true },
    orderBy: { createdAt: "desc" },
  });
}
