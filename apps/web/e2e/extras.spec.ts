import { expect, test } from "@playwright/test";
import { db, login, loginAs, makeUser } from "./helpers";

test.describe("ek özellikler", () => {
  test("yeni cihazdan giriş: ikinci tarayıcıdan girince kişiye bildirim düşer, cihazlar Hesabım'da listelenir", async ({ browser }) => {
    const user = await makeUser("VIEWER");
    const first = await browser.newPage();
    await login(first, user.email, user.password);
    await expect(first.getByRole("heading", { name: /Hoş geldin/ })).toBeVisible();

    const second = await (await browser.newContext()).newPage(); // ayrı çerezler = başka cihaz
    await login(second, user.email, user.password);
    await expect(second.getByRole("heading", { name: /Hoş geldin/ })).toBeVisible();

    await second.goto("/notifications");
    await expect(second.getByText("Hesabına yeni bir cihazdan giriş yapıldı")).toBeVisible();
    await second.goto("/account#cihazlar");
    await expect(second.locator("#cihazlar li")).toHaveCount(2);
  });

  test("global arama: Ctrl+K ile açılır, sonuca tıklayınca kayda gider; Operasyon finans sonucu görmez", async ({ page }) => {
    await loginAs(page, "admin");
    await page.keyboard.press("Control+k");
    await page.getByRole("dialog", { name: "Arama" }).getByLabel("Arama").fill("Atlas");
    const result = page.getByRole("button", { name: /Atlas Spor Merkezi/ }).first();
    await expect(result).toBeVisible();
    await result.click();
    await expect(page).toHaveURL(/\/customers\/[\w-]+$/);
    await expect(page.getByRole("heading", { name: "Atlas Spor Merkezi" })).toBeVisible();

    const income = await db.transaction.findFirstOrThrow({ where: { type: "INCOME", description: { not: null } } });
    await page.context().clearCookies();
    await loginAs(page, "ops");
    await page.keyboard.press("Control+k");
    await page.getByRole("dialog", { name: "Arama" }).getByLabel("Arama").fill(income.description!.slice(0, 12));
    await expect(page.getByText(/Sonuç bulunamadı|Aranıyor/)).toBeVisible();
    await expect(page.getByText("Finans kayıtları")).toHaveCount(0);
  });

  test("Excel/CSV'den müşteri aktarma: önizleme, onay, mükerrer atlama", async ({ page }) => {
    await loginAs(page, "ops");
    await page.goto("/customers");
    await page.getByRole("link", { name: "Excel/CSV'den aktar" }).click();
    const stamp = Date.now();
    const csv = `Ad;İletişim;Etiketler\nE2E Kafe ${stamp};0555;kafe\nE2E Bar ${stamp};;bar\nAtlas Spor Merkezi;;\n`;
    await page.getByLabel("Aktarılacak dosya").setInputFiles({ name: "liste.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await expect(page.getByText("2 eklenecek")).toBeVisible();
    await expect(page.getByText("Zaten var, atlanacak")).toBeVisible();
    await page.getByRole("button", { name: "2 müşteriyi ekle" }).click();
    await expect(page.getByText("2 müşteri eklendi.")).toBeVisible();
    expect(await db.customer.count({ where: { name: { contains: String(stamp) } } })).toBe(2);
  });

  test("dosya ekleri: finans kaydına fatura yüklenir, açılır, silinir; Operasyon finans detayına giremez", async ({ page }) => {
    const tx = await db.transaction.create({ data: { type: "EXPENSE", amount: 12_345, description: `E2E fatura ${Date.now()}`, occurredAt: new Date() } });
    await loginAs(page, "finance");
    await page.goto(`/finance/${tx.id}`);
    await expect(page.getByText(tx.description!)).toBeVisible();
    await page.getByLabel("Dosya ekle").setInputFiles({ name: "fatura-ekim.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\n%%EOF") });
    const link = page.getByRole("link", { name: "fatura-ekim.pdf" });
    await expect(link).toBeVisible();
    const response = await page.request.get((await link.getAttribute("href"))!);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("application/pdf");
    expect(response.headers()["content-security-policy"]).toContain("sandbox");

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "fatura-ekim.pdf sil" }).click();
    await expect(link).toHaveCount(0);
    expect(await db.attachment.count({ where: { transactionId: tx.id } })).toBe(0);

    await page.context().clearCookies();
    await loginAs(page, "ops");
    await page.goto(`/finance/${tx.id}`);
    await expect(page).toHaveURL(/\/$/); // Operasyon ana sayfaya yönlenir
  });

  test("takvim: çekim sürüklenip başka güne bırakılınca tarihi değişir, saat aynı kalır; Viewer sürükleyemez", async ({ page }) => {
    const shoot = await db.shoot.create({
      data: { typeId: (await db.optionItem.findFirstOrThrow({ where: { kind: "SHOOT_TYPE" } })).id, deliveryStatusId: (await db.optionItem.findFirstOrThrow({ where: { kind: "DELIVERY_STATUS" } })).id, scheduledAt: new Date(2026, 9, 6, 15, 45), location: "E2E sürükle" },
      include: { type: true },
    });
    await loginAs(page, "ops");
    await page.goto("/calendar?view=week&date=2026-10-06");
    const chip = page.getByRole("link", { name: /15:45 Çekim/ });
    await expect(chip).toBeVisible();
    await chip.dragTo(page.locator('[data-day="2026-10-08"]'));
    await expect(page.locator('[data-day="2026-10-08"]').getByRole("link", { name: /15:45 Çekim/ })).toBeVisible();
    const moved = await db.shoot.findUniqueOrThrow({ where: { id: shoot.id } });
    expect(moved.scheduledAt.getTime()).toBe(new Date(2026, 9, 8, 15, 45).getTime());

    await page.context().clearCookies();
    await loginAs(page, "viewer");
    await page.goto("/calendar?view=week&date=2026-10-06");
    expect(await page.getByRole("link", { name: /15:45 Çekim/ }).getAttribute("draggable")).toBe("false");
  });

  test("bildirim çarpıyla kaldırılır ve sayfa yenilense de geri gelmez", async ({ page }) => {
    const user = await makeUser("VIEWER");
    await db.notification.createMany({
      data: [
        { userId: user.id, type: "TASK_ASSIGNED", title: "Kalacak bildirim" },
        { userId: user.id, type: "TASK_ASSIGNED", title: "Silinecek bildirim" },
      ],
    });
    await login(page, user.email, user.password);
    await expect(page.getByRole("heading", { name: /Hoş geldin/ })).toBeVisible();
    await page.goto("/notifications");
    await page.getByRole("button", { name: "Bildirimi kaldır: Silinecek bildirim" }).click();
    await expect(page.getByText("Silinecek bildirim")).toHaveCount(0);
    await page.reload();
    await expect(page.getByText("Kalacak bildirim")).toBeVisible();
    await expect(page.getByText("Silinecek bildirim")).toHaveCount(0);
  });
});
