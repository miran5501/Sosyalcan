import { expect, test } from "@playwright/test";
import { DEMO, db, login, loginAs, makeUser } from "./helpers";

test.describe("giriş ve roller", () => {
  test("yanlış şifre hata verir, doğru şifre ana sayfayı açar", async ({ page }) => {
    await login(page, DEMO.admin.email, "yanlis-sifre");
    await expect(page.getByText("E-posta veya şifre hatalı")).toBeVisible();
    await loginAs(page, "admin");
    await expect(page.getByRole("link", { name: "Ayarlar" })).toBeVisible();
  });

  test("Operasyon finans menüsünü görmez ve finans sayfasına giremez", async ({ page }) => {
    await loginAs(page, "ops");
    await expect(page.getByRole("link", { name: "Finans" })).toHaveCount(0);
    await page.goto("/finance");
    await expect(page).toHaveURL(/\/$/);
  });

  test("admin'in açtığı kullanıcı ilk girişte şifresini değiştirmeye zorlanır", async ({ page }) => {
    const user = await makeUser("VIEWER");
    await db.user.update({ where: { id: user.id }, data: { mustChangePassword: true } });
    await login(page, user.email, user.password);
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByText("Devam etmeden önce kendi şifreni belirlemelisin")).toBeVisible();
    await page.goto("/customers");
    await expect(page).toHaveURL(/\/account$/);
  });
});
