import { expect, test } from "@playwright/test";
import { stepAt, totpCode } from "../src/lib/totp";
import { db, login, loginAs, makeUser } from "./helpers";

test.describe("hesap güvenliği", () => {
  test("şifremi unuttum: e-postadaki bağlantıyla yeni şifre belirlenir, eski şifre çalışmaz", async ({ page }) => {
    const user = await makeUser("OPERATIONS");
    await page.goto("/login");
    await page.getByRole("link", { name: "Şifremi unuttum" }).click();
    // Sayfa geçişi bitmeden yazılırsa e-posta giriş sayfasındaki kutuya gider.
    await expect(page.getByRole("heading", { name: "Şifremi unuttum" })).toBeVisible();
    await page.getByLabel("E-posta").fill(user.email);
    await page.getByRole("button", { name: "Sıfırlama bağlantısı gönder" }).click();
    await expect(page.getByText(/kayıtlıysa şifre sıfırlama bağlantısı gönderildi/)).toBeVisible();

    // Geliştirme modunda e-posta giden kutusuna yazılır (yanıttan sonra; birkaç saniye beklenebilir).
    await expect.poll(async () => db.emailMessage.count({ where: { to: user.email } }), { timeout: 15_000 }).toBe(1);
    const mail = await db.emailMessage.findFirstOrThrow({ where: { to: user.email } });
    const link = /https?:\/\/[^\s]+\/reset-password\?token=[\w-]+/.exec(mail.text)![0];

    await page.goto(new URL(link).pathname + new URL(link).search);
    await page.getByLabel("Yeni şifre", { exact: true }).fill("YeniSifre-2026");
    await page.getByLabel("Yeni şifre (tekrar)").fill("YeniSifre-2026");
    await page.getByRole("button", { name: "Şifreyi kaydet" }).click();
    await expect(page.getByText("Şifren sıfırlandı")).toBeVisible();

    await login(page, user.email, user.password);
    await expect(page.getByText("E-posta veya şifre hatalı")).toBeVisible();
    await login(page, user.email, "YeniSifre-2026");
    await expect(page.getByRole("heading", { name: /Hoş geldin/ })).toBeVisible();
  });

  test("2FA: kurulur, girişte kod istenir, yanlış kod reddedilir, doğru kodla girilir", async ({ page }) => {
    const user = await makeUser("FINANCE");
    await login(page, user.email, user.password);
    await expect(page.getByRole("heading", { name: /Hoş geldin/ })).toBeVisible(); // oturum çerezi gelsin
    await page.goto("/account");
    await page.getByRole("button", { name: "Doğrulama uygulamasıyla aç" }).click();
    const secret = (await page.locator("p.font-mono").first().textContent())!.trim();
    await page.getByLabel("Doğrulama kodu").fill(totpCode(secret, stepAt()));
    await page.getByRole("button", { name: "Doğrula ve aç" }).click();
    await expect(page.getByText("Kurtarma kodların")).toBeVisible();

    // Çıkış yapıp yeniden giriş: şifreden sonra kod adımı.
    await page.context().clearCookies();
    await login(page, user.email, user.password);
    await expect(page).toHaveURL(/\/login\/verify$/);
    await page.getByLabel("Doğrulama kodu").fill("000000");
    await page.getByRole("button", { name: "Doğrula ve giriş yap" }).click();
    await expect(page.getByText("Kod hatalı")).toBeVisible();
    // Kurulumda kullanılan adım tekrar kabul edilmez: bir sonraki adımın kodu.
    await page.getByLabel("Doğrulama kodu").fill(totpCode(secret, stepAt() + 1));
    await page.getByRole("button", { name: "Doğrula ve giriş yap" }).click();
    await expect(page.getByRole("heading", { name: /Hoş geldin/ })).toBeVisible();

    const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.twoFactorEnabledAt).not.toBeNull();
  });

  test("2FA (e-posta): kurulumda ve girişte e-postaya giden kodla doğrulanır", async ({ page }) => {
    const user = await makeUser("OPERATIONS");
    const lastCode = async () => {
      const mail = await db.emailMessage.findFirstOrThrow({ where: { to: user.email }, orderBy: { createdAt: "desc" } });
      return /(\d{6})/.exec(mail.subject)![1];
    };
    await login(page, user.email, user.password);
    await expect(page.getByRole("heading", { name: /Hoş geldin/ })).toBeVisible();
    await page.goto("/account");
    await page.getByRole("button", { name: "E-postayla aç" }).click();
    await expect(page.getByText(/adresine 6 haneli bir kod gönderdik/)).toBeVisible();
    await page.getByLabel("Doğrulama kodu").fill(await lastCode());
    await page.getByRole("button", { name: "Doğrula ve aç" }).click();
    await expect(page.getByText("Kurtarma kodların")).toBeVisible();
    await expect(page.getByText(/Açık · e-postayla kod/)).toBeVisible();

    await page.context().clearCookies();
    const before = await db.emailMessage.count({ where: { to: user.email } });
    await login(page, user.email, user.password);
    await expect(page).toHaveURL(/\/login\/verify$/);
    await expect(page.getByText(/adresine gönderdiğimiz 6 haneli kodu gir/)).toBeVisible();
    expect(await db.emailMessage.count({ where: { to: user.email } })).toBe(before + 1);

    await page.getByRole("button", { name: "Kodu yeniden gönder" }).click();
    await expect(page.getByText("Yeni kod gönderildi")).toBeVisible();
    await page.getByLabel("Doğrulama kodu").fill(await lastCode());
    await page.getByRole("button", { name: "Doğrula ve giriş yap" }).click();
    await expect(page.getByRole("heading", { name: /Hoş geldin/ })).toBeVisible();
  });

  test("KVKK aydınlatma metni oturumsuz açılır; Admin düzenleyince güncellenir", async ({ page }) => {
    await page.goto("/kvkk");
    await expect(page.getByRole("heading", { name: "Kişisel Verilerin İşlenmesine İlişkin Aydınlatma Metni" })).toBeVisible();

    await loginAs(page, "admin");
    await page.goto("/settings/privacy");
    const marker = `E2E Ajans ${Date.now()}`;
    const text = (await page.getByLabel("Aydınlatma metni").inputValue()).replace("[AJANSIN TİCARİ UNVANI]", marker);
    await page.getByLabel("Aydınlatma metni").fill(text);
    await page.getByRole("button", { name: "Kaydet" }).click();
    await expect(page.getByText("Kaydedildi.")).toBeVisible();
    await page.goto("/kvkk");
    await expect(page.getByText(marker)).toBeVisible();
  });
});
