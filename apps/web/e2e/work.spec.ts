import { expect, test } from "@playwright/test";
import { db, login, loginAs, makeUser } from "./helpers";

test.describe("günlük iş akışları", () => {
  test("Admin görev atar → kişiye bildirim düşer, tıklayınca göreve gider", async ({ browser }) => {
    const worker = await makeUser("OPERATIONS");
    const adminPage = await (await browser.newContext()).newPage();
    await loginAs(adminPage, "admin");
    await adminPage.goto("/tasks/new");
    const title = `E2E görev ${Date.now()}`;
    await adminPage.getByLabel(/Başlık/).fill(title);
    await adminPage.getByLabel("Atanan Kişi").selectOption({ label: worker.name });
    await adminPage.getByRole("button", { name: "Kaydet" }).click();
    await expect(adminPage).toHaveURL(/\/tasks$/);
    await expect(adminPage.getByText(title)).toBeVisible();

    const workerPage = await (await browser.newContext()).newPage();
    await login(workerPage, worker.email, worker.password);
    const navItem = workerPage.getByRole("link", { name: /Bildirimler/ });
    await expect(navItem.getByLabel(/okunmamış/)).toHaveText("1");
    await navItem.click();
    // Bildirim satırının kendisi (yanındaki çarpı düğmesinin görünür metni yok, o elenir).
    await workerPage.getByRole("button", { name: new RegExp(`Sana görev atandı: ${title}`) }).filter({ hasText: title }).click();
    await expect(workerPage).toHaveURL(/\/tasks\/.+\/edit$/);
  });

  test("çekim teslim kontrol listesinde madde işaretlenir ve listede ilerleme görünür", async ({ page }) => {
    const shoot = await db.shoot.findFirstOrThrow({ where: { archivedAt: null }, include: { checklist: true } });
    await loginAs(page, "admin");
    await page.goto(`/shoots/${shoot.id}/edit`);
    const before = shoot.checklist.filter((c) => c.done).length;
    await page.getByRole("button", { name: new RegExp(`${shoot.checklist[before].label}: tamamlandı olarak işaretle`) }).click();
    await expect(page.getByText(`${before + 1}/${shoot.checklist.length} tamamlandı`)).toBeVisible();
  });

  test("%20 KDV'li gelir kaydı: KDV payı hesaplanır, listede ve aylık özette görünür", async ({ page }) => {
    await loginAs(page, "finance");
    await page.goto("/finance/new");
    await page.getByLabel("Tür").selectOption("INCOME");
    await page.getByLabel(/Tutar/).fill("1200");
    await page.getByLabel("KDV oranı").selectOption("20");
    const invoice = `E2E-${Date.now()}`;
    await page.getByLabel(/Fatura no/).fill(invoice);
    await page.getByRole("button", { name: "Kaydet" }).click();
    await expect(page).toHaveURL(/\/finance$/);
    await expect(page.getByText(`Fatura ${invoice} · KDV %20 · ₺200,00`)).toBeVisible();
    await expect(page.getByText("KDV özeti")).toBeVisible();
  });

  test("müşteri listesi sayfalıdır", async ({ page }) => {
    const existing = await db.customer.count({ where: { archivedAt: null } });
    await db.customer.createMany({ data: Array.from({ length: Math.max(0, 26 - existing) }, (_, i) => ({ name: `E2E Sayfa Müşteri ${i}` })) });
    await loginAs(page, "admin");
    await page.goto("/customers");
    await expect(page.getByText(/Sayfa 1 \/ \d+/)).toBeVisible();
    await page.getByRole("link", { name: "Sonraki →" }).click();
    await expect(page).toHaveURL(/page=2/);
  });
});
