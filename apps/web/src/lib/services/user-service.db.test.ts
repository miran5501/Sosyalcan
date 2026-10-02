import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { resetDb } from "@/test/db-helpers";
import { changeOwnPassword, createUser, listAssignableUsers, verifyCredentials } from "./user-service";

beforeEach(resetDb);

const newUser = (overrides: Partial<Parameters<typeof createUser>[0]> = {}) =>
  createUser({ name: "Deneme", email: "deneme@sosyalcan.local", password: "gizli-sifre-1", role: "OPERATIONS", ...overrides });

describe("createUser", () => {
  it("şifreyi düz metin değil bcrypt özeti olarak saklar", async () => {
    const user = await newUser();
    expect(user.passwordHash).not.toContain("gizli-sifre-1");
    expect(user.passwordHash.startsWith("$2")).toBe(true);
  });

  it("aynı e-postayla ikinci kullanıcı oluşturulamaz", async () => {
    await newUser();
    await expect(newUser({ name: "Başkası" })).rejects.toMatchObject({ code: "P2002" });
  });
});

describe("verifyCredentials", () => {
  it("doğru şifreyle kullanıcıyı döner, şifre özetini içermez", async () => {
    const created = await newUser();

    const user = await verifyCredentials("deneme@sosyalcan.local", "gizli-sifre-1");

    expect(user).toEqual({ id: created.id, name: "Deneme", email: "deneme@sosyalcan.local", role: "OPERATIONS", sessionVersion: 0, mustChangePassword: false, twoFactorEnabled: false, twoFactorMethod: null });
    expect(user).not.toHaveProperty("passwordHash");
    const after = await prisma.user.findUniqueOrThrow({ where: { id: created.id } });
    expect(after.lastLoginAt).not.toBeNull();
  });

  it("yanlış şifre ve olmayan e-posta aynı şekilde null döner", async () => {
    await newUser();
    expect(await verifyCredentials("deneme@sosyalcan.local", "yanlis")).toBeNull();
    expect(await verifyCredentials("yok@sosyalcan.local", "gizli-sifre-1")).toBeNull();
  });

  it("devre dışı bırakılmış hesap doğru şifreyle bile giriş yapamaz", async () => {
    const created = await newUser();
    await prisma.user.update({ where: { id: created.id }, data: { disabledAt: new Date() } });

    expect(await verifyCredentials("deneme@sosyalcan.local", "gizli-sifre-1")).toBeNull();
  });
});

describe("changeOwnPassword", () => {
  it("mevcut şifre doğruysa değiştirir, oturum sürümünü artırır ve mobil token'ları iptal eder", async () => {
    const created = await newUser();
    await prisma.refreshToken.create({
      data: { userId: created.id, tokenHash: "h1", familyId: "f1", expiresAt: new Date(Date.now() + 86_400_000) },
    });

    await changeOwnPassword(created.id, "gizli-sifre-1", "yeni-sifre-2");

    expect(await verifyCredentials("deneme@sosyalcan.local", "gizli-sifre-1")).toBeNull();
    expect(await verifyCredentials("deneme@sosyalcan.local", "yeni-sifre-2")).not.toBeNull();
    const after = await prisma.user.findUniqueOrThrow({ where: { id: created.id } });
    expect(after.sessionVersion).toBe(1);
    expect(after.passwordChangedAt).not.toBeNull();
    expect((await prisma.refreshToken.findFirstOrThrow()).revokedAt).not.toBeNull();
  });

  it("mevcut şifre yanlışsa ya da yeni şifre eskisiyle aynıysa reddeder", async () => {
    const created = await newUser();
    await expect(changeOwnPassword(created.id, "yanlis", "yeni-sifre-2")).rejects.toMatchObject({ status: 400 });
    await expect(changeOwnPassword(created.id, "gizli-sifre-1", "gizli-sifre-1")).rejects.toMatchObject({ status: 400 });
  });
});

describe("listAssignableUsers", () => {
  it("devre dışı kullanıcıları listelemez ve hassas alan döndürmez", async () => {
    await newUser({ name: "Aktif", email: "aktif@sosyalcan.local" });
    const disabled = await newUser({ name: "Pasif", email: "pasif@sosyalcan.local" });
    await prisma.user.update({ where: { id: disabled.id }, data: { disabledAt: new Date() } });

    const users = await listAssignableUsers();

    expect(users.map((u) => u.name)).toEqual(["Aktif"]);
    expect(Object.keys(users[0]).sort()).toEqual(["id", "name", "role"]);
  });
});
