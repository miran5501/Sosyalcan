import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushAuditQueue, prisma } from "@/lib/prisma";
import { open } from "@/lib/secret-box";
import { stepAt, totpCode } from "@/lib/totp";
import { makeCustomer, resetDb, shootDefaults, taskDefaults } from "@/test/db-helpers";
import { createUser, verifyCredentials } from "./user-service";
import { passwordLoginStep } from "./login-service";
import { clearTwoFactor, confirmSetup, disableTwoFactor, resendLoginCode, startSetup, verifySecondFactor } from "./two-factor-service";
import { hashResetToken, isResetTokenValid, requestPasswordReset, resetPassword } from "./password-reset-service";
import { anonymizeCustomer, anonymizeUser, exportUserData, runRetentionCleanup, savePrivacySettings } from "./privacy-service";
import { listCustomersPage } from "./customer-service";
import { listShootsPage } from "./shoot-service";
import { DONE_TASKS_LIMIT, listTasks } from "./task-service";
import { listErrors, recordError, resolveError } from "@/lib/error-tracking";
import * as mobileLogin from "@/app/api/mobile/login/route";
import * as mobileVerify from "@/app/api/mobile/login/verify/route";
import * as mobileResend from "@/app/api/mobile/login/resend/route";

beforeEach(resetDb);

let seq = 0;
const PASSWORD = "sifre-123456";
const newUser = (role: "ADMIN" | "OPERATIONS" | "FINANCE" | "VIEWER" = "OPERATIONS") =>
  createUser({ name: `Kişi ${++seq}`, email: `kisi${seq}@x.co`, password: PASSWORD, role });
const ipHeaders = () => new Headers({ "x-forwarded-for": `10.9.${seq}.${Math.floor(Math.random() * 200)}` });

/** 2FA'yı gerçek akışla açar; şu anki adımın bir sonrakinin kodunu döndürmek için anahtarı verir. */
async function appSetup(userId: string) {
  return (await startSetup(userId, "APP")) as { secret: string };
}
async function enable2fa(userId: string) {
  const { secret } = await appSetup(userId);
  const { recoveryCodes } = await confirmSetup(userId, totpCode(secret, stepAt()));
  return { secret, recoveryCodes };
}

describe("iki adımlı doğrulama (2FA)", () => {
  it("kurulum: ilk kod doğrulanınca açılır; anahtar veritabanında şifreli durur", async () => {
    const user = await newUser();
    const { secret } = await appSetup(user.id);
    await expect(confirmSetup(user.id, "000000")).rejects.toMatchObject({ status: 400 });
    const { recoveryCodes } = await confirmSetup(user.id, totpCode(secret, stepAt()));

    expect(recoveryCodes).toHaveLength(8);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.twoFactorEnabledAt).not.toBeNull();
    expect(row.totpSecret).not.toContain(secret);
    expect(open(row.totpSecret!)).toBe(secret);
    expect(row.recoveryCodes.join()).not.toContain(recoveryCodes[0]); // yalnızca özetleri
  });

  it("şifre adımı 2FA'lı hesapta oturumu açmaz ve başarı kaydı yazmaz", async () => {
    const user = await newUser();
    await enable2fa(user.id);
    const step = await passwordLoginStep(user.email, PASSWORD, ipHeaders(), "Web");
    expect(step).toMatchObject({ ok: true, twoFactor: "APP" });
    await flushAuditQueue();
    expect(await prisma.auditLog.count({ where: { action: "LOGIN_SUCCESS" } })).toBe(0);
  });

  it("kod bir kez kullanılır; kurtarma kodu bir kez kullanılır; 5 hatalı denemede kilitlenir", async () => {
    const user = await newUser();
    const { secret, recoveryCodes } = await enable2fa(user.id);
    // Kurulumda şu anki adım kullanıldı: aynı kod tekrar kabul edilmez, bir sonraki adımın kodu edilir.
    expect(await verifySecondFactor(user.id, totpCode(secret, stepAt()), null)).toMatchObject({ ok: false });
    expect(await verifySecondFactor(user.id, totpCode(secret, stepAt() + 1), null)).toEqual({ ok: true, usedRecovery: false });

    expect(await verifySecondFactor(user.id, recoveryCodes[0].toLowerCase(), null)).toEqual({ ok: true, usedRecovery: true });
    expect(await verifySecondFactor(user.id, recoveryCodes[0], null)).toMatchObject({ ok: false });

    const other = await newUser();
    await enable2fa(other.id);
    let last = { ok: true } as Awaited<ReturnType<typeof verifySecondFactor>>;
    for (let i = 0; i < 5; i++) last = await verifySecondFactor(other.id, "111111", null);
    expect(last).toEqual({ ok: false, locked: true });
    await flushAuditQueue();
    expect(await prisma.auditLog.count({ where: { action: "TWO_FACTOR_FAILED", userId: other.id } })).toBe(5);
  });

  it("kapatmak şifre ve kod ister; Admin sıfırlaması her şeyi temizler", async () => {
    const user = await newUser();
    const { recoveryCodes } = await enable2fa(user.id);
    await expect(disableTwoFactor(user.id, "yanlis-sifre", recoveryCodes[1], null)).rejects.toMatchObject({ status: 400 });
    await disableTwoFactor(user.id, PASSWORD, recoveryCodes[1], null);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).twoFactorEnabledAt).toBeNull();

    await enable2fa(user.id);
    await clearTwoFactor(user.id);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect([row.totpSecret, row.twoFactorEnabledAt, row.recoveryCodes.length]).toEqual([null, null, 0]);
  });

  it("mobil: şifre doğruysa token yerine kod adımı; doğru kodla token'lar", async () => {
    const user = await newUser();
    const { secret } = await enable2fa(user.id);
    const post = (handler: (r: NextRequest) => Promise<Response>, body: unknown) =>
      handler(new NextRequest("http://localhost/x", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", "x-forwarded-for": "10.8.8.8" } }));

    const first = await (await post(mobileLogin.POST, { email: user.email, password: PASSWORD })).json();
    expect(first.twoFactorRequired).toBe(true);
    expect(first.accessToken).toBeUndefined();

    expect((await post(mobileVerify.POST, { challengeToken: first.challengeToken, code: "000000" })).status).toBe(401);
    const ok = await post(mobileVerify.POST, { challengeToken: first.challengeToken, code: totpCode(secret, stepAt() + 1) });
    expect(ok.status).toBe(200);
    expect((await ok.json()).refreshToken).toBeTruthy();
  });
});

/** Kişiye giden son e-postadaki 6 haneli kod (geliştirme modunda giden kutusundan). */
async function lastEmailCode(email: string) {
  const mail = await prisma.emailMessage.findFirstOrThrow({ where: { to: email }, orderBy: { createdAt: "desc" } });
  return /(\d{6})/.exec(mail.subject)![1];
}

describe("e-postayla iki adımlı doğrulama", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("kurulum: e-postaya kod gider, doğru kodla açılır; kod veritabanında açık durmaz", async () => {
    const user = await newUser();
    expect(await startSetup(user.id, "EMAIL")).toEqual({ method: "EMAIL", email: expect.stringContaining("•••@x.co") });
    const code = await lastEmailCode(user.email);
    const pending = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(pending.emailOtpHash).not.toContain(code);

    await expect(confirmSetup(user.id, code === "000000" ? "111111" : "000000", "EMAIL")).rejects.toMatchObject({ status: 400 });
    const { recoveryCodes } = await confirmSetup(user.id, code, "EMAIL");
    expect(recoveryCodes).toHaveLength(8);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect([row.twoFactorMethod, row.emailOtpHash, row.totpSecret]).toEqual(["EMAIL", null, null]);
    expect(row.twoFactorEnabledAt).not.toBeNull();
  });

  it("giriş: şifre adımı kodu gönderir; kod bir kez geçer; yeni kod eskisini geçersiz kılar; süresi dolan geçmez", async () => {
    const user = await newUser();
    await startSetup(user.id, "EMAIL");
    await confirmSetup(user.id, await lastEmailCode(user.email), "EMAIL");

    const step = await passwordLoginStep(user.email, PASSWORD, ipHeaders(), "Web");
    expect(step).toMatchObject({ ok: true, twoFactor: "EMAIL" });
    const code = await lastEmailCode(user.email);
    expect(await verifySecondFactor(user.id, code, null)).toEqual({ ok: true, usedRecovery: false });
    expect(await verifySecondFactor(user.id, code, null)).toMatchObject({ ok: false }); // tek kullanımlık

    await passwordLoginStep(user.email, PASSWORD, ipHeaders(), "Web");
    const old = await lastEmailCode(user.email);
    expect(await resendLoginCode(user.id)).toBe("sent");
    const fresh = await lastEmailCode(user.email);
    if (old !== fresh) expect(await verifySecondFactor(user.id, old, null)).toMatchObject({ ok: false });
    await prisma.user.update({ where: { id: user.id }, data: { emailOtpExpiresAt: new Date(Date.now() - 1000) } });
    expect(await verifySecondFactor(user.id, fresh, null)).toMatchObject({ ok: false });

    // Kod gönderme ve doğrulama denetim kaydına "kullanıcı güncellendi" diye düşmez (gürültü).
    await flushAuditQueue();
    expect(await prisma.auditLog.count({ where: { entityId: user.id, action: "UPDATE" } })).toBeLessThanOrEqual(1);
  });

  it("kod gönderimi kişi başına 15 dakikada 5 ile sınırlı", async () => {
    const user = await newUser();
    await startSetup(user.id, "EMAIL"); // 1
    await confirmSetup(user.id, await lastEmailCode(user.email), "EMAIL");
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await resendLoginCode(user.id));
    expect(results).toEqual(["sent", "sent", "sent", "sent", "limited"]);
  });

  it("uygulama yöntemindeki hesap için kod gönderilmez; canlıda SMTP yokken e-posta yöntemi açılamaz", async () => {
    const appUser = await newUser();
    await enable2fa(appUser.id);
    expect(await resendLoginCode(appUser.id)).toBe("not-email");

    const user = await newUser();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SMTP_URL", "");
    await expect(startSetup(user.id, "EMAIL")).rejects.toMatchObject({ status: 400 });
    expect(await prisma.emailMessage.count({ where: { to: user.email } })).toBe(0);
  });

  it("mobil: yöntem EMAIL döner, kod yeniden istenebilir, son kodla token'lar", async () => {
    const user = await newUser();
    await startSetup(user.id, "EMAIL");
    await confirmSetup(user.id, await lastEmailCode(user.email), "EMAIL");
    const post = (handler: (r: NextRequest) => Promise<Response>, body: unknown) =>
      handler(new NextRequest("http://localhost/x", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", "x-forwarded-for": "10.8.8.9" } }));

    const first = await (await post(mobileLogin.POST, { email: user.email, password: PASSWORD })).json();
    expect(first).toMatchObject({ twoFactorRequired: true, method: "EMAIL" });
    expect((await post(mobileResend.POST, { challengeToken: first.challengeToken })).status).toBe(204);
    expect((await post(mobileResend.POST, { challengeToken: "gecersiz-bilet-gecersiz-bilet" })).status).toBe(401);
    const ok = await post(mobileVerify.POST, { challengeToken: first.challengeToken, code: await lastEmailCode(user.email) });
    expect(ok.status).toBe(200);
    expect((await ok.json()).refreshToken).toBeTruthy();
  });

  it("kapatma: e-postaya gelen kod + şifre ile", async () => {
    const user = await newUser();
    await startSetup(user.id, "EMAIL");
    await confirmSetup(user.id, await lastEmailCode(user.email), "EMAIL");
    const { sendManagementCode } = await import("./two-factor-service");
    await sendManagementCode(user.id);
    await disableTwoFactor(user.id, PASSWORD, await lastEmailCode(user.email), null);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect([row.twoFactorEnabledAt, row.twoFactorMethod, row.emailOtpHash]).toEqual([null, null, null]);
  });
});

describe("şifremi unuttum", () => {
  it("bağlantı e-postayla gider, tek kullanımlık; şifreyi değiştirir ve oturumları kapatır", async () => {
    const user = await newUser();
    await prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: true } });
    expect(await requestPasswordReset(user.email.toUpperCase(), "1.1.1.1")).toBe("sent");

    const mail = await prisma.emailMessage.findFirstOrThrow({ where: { to: user.email } });
    const raw = /token=([A-Za-z0-9_-]+)/.exec(mail.text)![1];
    expect((await prisma.passwordResetToken.findFirstOrThrow()).tokenHash).toBe(hashResetToken(raw));
    expect(await isResetTokenValid(raw)).toBe(true);

    expect(await resetPassword(raw, "yeniSifre9", null)).toBe(true);
    expect(await resetPassword(raw, "baskaSifre9", null)).toBe(false); // ikinci kez kullanılamaz
    expect(await verifyCredentials(user.email, "yeniSifre9")).not.toBeNull();
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row).toMatchObject({ sessionVersion: 1, mustChangePassword: false });
  });

  it("kayıtlı olmayan adres sessizce yok sayılır; saatte 3'ten fazla istek sınırlanır; süresi dolan bağlantı geçmez", async () => {
    expect(await requestPasswordReset("yok@x.co", null)).toBe("ignored");
    expect(await prisma.emailMessage.count()).toBe(0);

    const user = await newUser();
    for (let i = 0; i < 3; i++) await requestPasswordReset(user.email, null);
    expect(await requestPasswordReset(user.email, null)).toBe("limited");

    const latest = await prisma.emailMessage.findFirstOrThrow({ where: { to: user.email }, orderBy: { createdAt: "desc" } });
    const raw = /token=([A-Za-z0-9_-]+)/.exec(latest.text)![1];
    await prisma.passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await resetPassword(raw, "yeniSifre9", null)).toBe(false);
  });
});

describe("KVKK", () => {
  it("saklama süresi dolan denetim/bildirim/e-posta/hata kayıtları silinir, yenileri kalır", async () => {
    await savePrivacySettings({ notice: "x".repeat(60), auditRetentionDays: 30, notificationRetentionDays: 7, emailRetentionDays: 7, errorRetentionDays: 7 });
    const user = await newUser();
    const old = new Date(Date.now() - 40 * 86_400_000);
    await prisma.auditLog.createMany({ data: [{ action: "LOGIN_FAILED", createdAt: old }, { action: "LOGIN_FAILED" }] });
    await prisma.notification.createMany({ data: [{ userId: user.id, type: "TASK_ASSIGNED", title: "eski", createdAt: old }, { userId: user.id, type: "TASK_ASSIGNED", title: "yeni" }] });
    await prisma.emailMessage.create({ data: { to: "a@b.co", subject: "eski", text: "x", status: "LOGGED", createdAt: old } });

    const result = await runRetentionCleanup();

    expect(result).toMatchObject({ auditLogs: 1, notifications: 1, emails: 1 });
    expect(await prisma.auditLog.count()).toBeGreaterThanOrEqual(1);
    expect((await prisma.notification.findMany()).map((n) => n.title)).toEqual(["yeni"]);
  });

  it("verilerimi indir: kendi verileri var, gizli alanlar yok", async () => {
    const user = await newUser();
    await enable2fa(user.id);
    const data = await exportUserData(user.id);
    const text = JSON.stringify(data);
    expect(data.profile.email).toBe(user.email);
    expect(text).not.toContain("passwordHash");
    expect(text).not.toContain("totpSecret");
    expect(text).not.toContain("recoveryCodes");
  });

  it("müşteri anonimleştirme: kişisel bilgiler ve denetim kaydındaki eski değerler silinir, finans kaydı kalır", async () => {
    const customer = await prisma.customer.create({ data: { name: "Ayşe Yılmaz Kuaför", contact: "0555 111 22 33", notes: "VIP", tags: ["kuafor"] } });
    await prisma.customer.update({ where: { id: customer.id }, data: { contact: "0555 999 88 77" } });
    await prisma.transaction.create({ data: { type: "INCOME", amount: 1000, customerId: customer.id } });
    await flushAuditQueue();

    const anonymous = await anonymizeCustomer(customer.id);

    const row = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(row).toMatchObject({ name: anonymous, contact: null, notes: null, tags: [] });
    expect(row.anonymizedAt).not.toBeNull();
    expect(await prisma.transaction.count({ where: { customerId: customer.id } })).toBe(1);
    await flushAuditQueue();
    const logs = JSON.stringify(await prisma.auditLog.findMany());
    expect(logs).not.toContain("Ayşe Yılmaz");
    expect(logs).not.toContain("0555");
    await expect(anonymizeCustomer(customer.id)).rejects.toMatchObject({ status: 409 });
  });

  it("kullanıcı anonimleştirme: kendini ve son Admin'i anonimleştiremezsin; e-posta kayıtlardan silinir", async () => {
    const admin = await newUser("ADMIN");
    const user = await newUser("OPERATIONS");
    await passwordLoginStep(user.email, "yanlis-sifre", ipHeaders(), "Web"); // denetimde e-postası geçen kayıt
    await expect(anonymizeUser(admin.id, admin.id)).rejects.toMatchObject({ status: 400 });
    await expect(anonymizeUser(user.id, admin.id)).rejects.toMatchObject({ status: 400 }); // son aktif Admin

    await anonymizeUser(admin.id, user.id);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.name).toMatch(/^Silinmiş kullanıcı #/);
    expect(row.email).toMatch(/@anonim\.local$/);
    expect(row.disabledAt).not.toBeNull();
    expect(await verifyCredentials(user.email, PASSWORD)).toBeNull();
    await flushAuditQueue();
    expect(JSON.stringify(await prisma.auditLog.findMany())).not.toContain(user.email);
  });
});

describe("hata takibi", () => {
  it("aynı hata gruplanır (sayaç artar); Admin'e yalnızca ilk kez ve yeniden açılınca bildirim gider", async () => {
    const admin = await newUser("ADMIN");
    await newUser("OPERATIONS");
    await recordError({ source: "server", message: "Kayıt cmabcdefghijklmnopqrst bulunamadı", path: "/tasks/cmabcdefghijklmnopqrst/edit" });
    await recordError({ source: "server", message: "Kayıt cmzzzzzzzzzzzzzzzzzzzz bulunamadı", path: "/tasks/cmzzzzzzzzzzzzzzzzzzzz/edit" });

    const [event] = await listErrors();
    expect(event.count).toBe(2);
    expect(await prisma.notification.count({ where: { type: "SYSTEM_ERROR" } })).toBe(1); // yalnızca Admin, bir kez
    expect((await prisma.notification.findFirstOrThrow()).userId).toBe(admin.id);

    await resolveError(event.id);
    await recordError({ source: "server", message: "Kayıt cmyyyyyyyyyyyyyyyyyyyy bulunamadı", path: "/tasks/cmyyyyyyyyyyyyyyyyyyyy/edit" });
    expect(await prisma.notification.count({ where: { type: "SYSTEM_ERROR" } })).toBe(2);
    expect((await listErrors())[0].resolvedAt).toBeNull();
  });
});

describe("sayfalama", () => {
  it("müşteriler 25'er, arama ve sayfa birlikte çalışır", async () => {
    for (let i = 0; i < 30; i++) await makeCustomer(`Müşteri ${String(i).padStart(2, "0")}`);
    const first = await listCustomersPage({ page: 1 });
    const second = await listCustomersPage({ page: 2 });
    expect([first.items.length, second.items.length, first.total, first.pageCount]).toEqual([25, 5, 30, 2]);
    expect((await listCustomersPage({ page: 1, search: "Müşteri 2" })).total).toBe(10);
  });

  it("çekimler yaklaşan/geçmiş olarak ayrılır; geçmiş yeniden eskiye", async () => {
    const now = new Date(2026, 9, 15, 12);
    await prisma.shoot.createMany({
      data: [
        { scheduledAt: new Date(2026, 9, 20), ...shootDefaults },
        { scheduledAt: new Date(2026, 9, 15, 9), ...shootDefaults }, // bugün sabah: yaklaşan sayılır
        { scheduledAt: new Date(2026, 9, 1), ...shootDefaults },
        { scheduledAt: new Date(2026, 8, 1), ...shootDefaults },
      ],
    });
    const upcoming = await listShootsPage({ when: "upcoming", page: 1, now });
    const past = await listShootsPage({ when: "past", page: 1, now });
    expect(upcoming.total).toBe(2);
    expect(past.items.map((s) => s.scheduledAt.getMonth())).toEqual([9, 8]);
  });

  it("panoda tamamlanan sütundan yalnızca son 30 görev gelir; istenirse hepsi", async () => {
    await prisma.task.createMany({ data: Array.from({ length: 35 }, (_, i) => ({ title: `Bitti ${i}`, statusId: "opt_task_done" })) });
    await prisma.task.create({ data: { title: "Açık", ...taskDefaults } });
    expect(await listTasks()).toHaveLength(DONE_TASKS_LIMIT + 1);
    expect(await listTasks({ allDone: true })).toHaveLength(36);
  });
});
