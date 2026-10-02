import { beforeEach, describe, expect, it } from "vitest";
import { flushAuditQueue, prisma } from "@/lib/prisma";
import { verifyMobileToken } from "@/lib/mobile-token";
import { resetDb } from "@/test/db-helpers";
import { createUser } from "./user-service";
import { updateUserByAdmin } from "./user-admin-service";
import {
  hashToken,
  issueTokenPair,
  listActiveMobileSessions,
  revokeAllSessions,
  revokeRefreshToken,
  rotateRefreshToken,
} from "./session-service";

beforeEach(resetDb);

const meta = { ip: "10.0.0.1", userAgent: "test-cihaz" };
const newUser = (email = "mobil@sosyalcan.local") =>
  createUser({ name: "Mobil", email, password: "sifre-123456", role: "OPERATIONS" });

describe("issueTokenPair", () => {
  it("15 dakikalık access token ve veritabanında yalnızca özeti tutulan refresh token verir", async () => {
    const user = await newUser();
    const pair = await issueTokenPair(user, meta);

    expect(pair.expiresIn).toBe(15 * 60);
    expect(await verifyMobileToken(pair.accessToken)).toEqual({ userId: user.id, sessionVersion: 0 });
    const stored = await prisma.refreshToken.findFirstOrThrow();
    expect(stored.tokenHash).toBe(hashToken(pair.refreshToken));
    expect(stored.tokenHash).not.toBe(pair.refreshToken);
    expect(stored.userAgent).toBe("test-cihaz");
  });
});

describe("rotateRefreshToken", () => {
  it("yeni bir çift verir, eski refresh token'ı iptal eder", async () => {
    const user = await newUser();
    const first = await issueTokenPair(user, meta);

    const second = await rotateRefreshToken(first.refreshToken, meta);

    expect(second?.user.id).toBe(user.id);
    expect(second?.refreshToken).not.toBe(first.refreshToken);
    expect(await rotateRefreshToken(second!.refreshToken, meta)).not.toBeNull();
  });

  it("kullanılmış token tekrar gelirse (çalınma) bütün aile iptal edilir ve kayda geçer", async () => {
    const user = await newUser();
    const first = await issueTokenPair(user, meta);
    const second = await rotateRefreshToken(first.refreshToken, meta);

    expect(await rotateRefreshToken(first.refreshToken, meta)).toBeNull(); // saldırgan eski token'ı dener
    expect(await rotateRefreshToken(second!.refreshToken, meta)).toBeNull(); // gerçek kullanıcınınki de iptal oldu

    const log = await prisma.auditLog.findFirst({ where: { action: "TOKEN_REUSE" } });
    expect(log?.userId).toBe(user.id);
  });

  it("bilinmeyen, süresi dolmuş token ve devre dışı hesap reddedilir", async () => {
    const user = await newUser();
    const pair = await issueTokenPair(user, meta);
    expect(await rotateRefreshToken("bilinmeyen-token-bilinmeyen-token", meta)).toBeNull();

    await prisma.refreshToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await rotateRefreshToken(pair.refreshToken, meta)).toBeNull();

    const other = await issueTokenPair(user, meta);
    await prisma.user.update({ where: { id: user.id }, data: { disabledAt: new Date() } });
    expect(await rotateRefreshToken(other.refreshToken, meta)).toBeNull();
  });

  it("aynı token'la eşzamanlı iki yenilemeden yalnızca biri başarılı olur", async () => {
    const user = await newUser();
    const pair = await issueTokenPair(user, meta);

    const results = await Promise.all([rotateRefreshToken(pair.refreshToken, meta), rotateRefreshToken(pair.refreshToken, meta)]);

    expect(results.filter(Boolean)).toHaveLength(1);
  });
});

describe("çıkış ve oturum kapatma", () => {
  it("çıkış yalnızca o cihazın token ailesini iptal eder", async () => {
    const user = await newUser();
    const phone = await issueTokenPair(user, meta);
    const tablet = await issueTokenPair(user, meta);

    expect(await revokeRefreshToken(phone.refreshToken)).toBe(user.id);

    expect(await rotateRefreshToken(phone.refreshToken, meta)).toBeNull();
    expect(await rotateRefreshToken(tablet.refreshToken, meta)).not.toBeNull();
    expect(await listActiveMobileSessions(user.id)).toHaveLength(1);
  });

  it("tüm oturumları kapatmak oturum sürümünü artırır: eski access token'lar artık eşleşmez", async () => {
    const user = await newUser();
    const pair = await issueTokenPair(user, meta);

    await revokeAllSessions(user.id);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.sessionVersion).toBe(1);
    expect((await verifyMobileToken(pair.accessToken))?.sessionVersion).toBe(0); // api-auth bunu 401'e çevirir
    expect(await rotateRefreshToken(pair.refreshToken, meta)).toBeNull();
  });

  it("admin şifre sıfırlayınca kişinin oturumları düşer; yalnızca ad değişince düşmez", async () => {
    const admin = await createUser({ name: "Admin", email: "admin@x.co", password: "sifre-123456", role: "ADMIN" });
    const user = await newUser();
    await issueTokenPair(user, meta);

    await updateUserByAdmin(admin.id, user.id, { name: "Yeni Ad" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).sessionVersion).toBe(0);
    expect(await listActiveMobileSessions(user.id)).toHaveLength(1);

    await updateUserByAdmin(admin.id, user.id, { password: "yeni-sifre-9" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).sessionVersion).toBe(1);
    expect(await listActiveMobileSessions(user.id)).toHaveLength(0);
    await flushAuditQueue();
  });
});
