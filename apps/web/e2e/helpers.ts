import { expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

/** Testlerin doğrudan okuduğu/yazdığı e2e veritabanı (scripts/e2e.mjs DATABASE_URL'i ayarlar). */
export const db = new PrismaClient();

export const DEMO = {
  admin: { email: "admin@sosyalcan.local", password: "admin1234" },
  ops: { email: "operasyon@sosyalcan.local", password: "operasyon1234" },
  finance: { email: "finans@sosyalcan.local", password: "finans1234" },
  viewer: { email: "viewer@sosyalcan.local", password: "viewer1234" },
};

let counter = 0;
/** Bu testin kendi kullanıcısı (testler birbirinin verisini bozmasın). */
export async function makeUser(role: "ADMIN" | "OPERATIONS" | "FINANCE" | "VIEWER" = "OPERATIONS", password = "Deneme-1234") {
  const email = `e2e-${Date.now()}-${++counter}@sosyalcan.local`;
  const user = await db.user.create({
    data: { name: `E2E ${role} ${counter}`, email, role, passwordHash: await bcrypt.hash(password, 10) },
  });
  return { ...user, password };
}

export async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Şifre", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Giriş Yap" }).click();
}

export async function loginAs(page: Page, who: keyof typeof DEMO) {
  await login(page, DEMO[who].email, DEMO[who].password);
  await expect(page.getByRole("heading", { name: /Hoş geldin/ })).toBeVisible();
}
