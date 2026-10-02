import { NextRequest } from "next/server";
import type { Role } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "@/auth";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { makeCustomer, resetDb } from "@/test/db-helpers";
import { GET } from "./finance/export/route";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const headersMock = headers as unknown as ReturnType<typeof vi.fn>;
const loginAs = (role: Role) => authMock.mockResolvedValue({ user: { id: "u1", name: "Test", email: "t@t.co", role } });
const call = (query = "") => GET(new NextRequest(`http://localhost/api/finance/export${query}`));

beforeEach(async () => {
  await resetDb();
  authMock.mockReset();
  headersMock.mockReset();
  headersMock.mockResolvedValue(new Headers());
});

async function seed() {
  const customer = await makeCustomer("Mavi Kırtasiye");
  await prisma.transaction.createMany({
    data: [
      { type: "INCOME", amount: 350_000, category: "Ödeme Planı", description: "İçerik Paketi", customerId: customer.id, occurredAt: new Date(2026, 8, 5, 12) },
      { type: "EXPENSE", amount: 125_050, category: "Kira", occurredAt: new Date(2026, 8, 10, 12) },
      { type: "EXPENSE", amount: 99_900, category: "Ekipman", occurredAt: new Date(2026, 7, 20, 12) }, // Ağustos
    ],
  });
}

describe("GET /api/finance/export", () => {
  it("seçilen ayın kayıtlarını Excel uyumlu CSV olarak, indirme başlıklarıyla verir", async () => {
    await seed();
    loginAs("FINANCE");

    const response = await call("?year=2026&month=9");
    // Response.text() BOM'u kendiliğinden atar; Excel'in Türkçe karakterleri doğru okuması için BOM ham baytlarda aranır.
    const bytes = new Uint8Array(await response.clone().arrayBuffer());
    const text = await response.text();

    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="finans-2026-09.csv"');
    expect(text.startsWith("Tarih;Saat;Tür;Kategori;Açıklama;Kime / Kimden;Ödeme Yöntemi;Müşteri;Fatura No;KDV %;KDV (TL);Tutar (TL)")).toBe(true);
    expect(text).toContain("05.09.2026;12:00;Gelir;Ödeme Planı;İçerik Paketi;;;Mavi Kırtasiye;;;;3500,00");
    expect(text).toContain("10.09.2026;12:00;Gider;Kira;;;;;;;;1250,50");
    expect(text).not.toContain("Ekipman"); // Ağustos kaydı bu aya girmez
  });

  it("yalnızca yıl verilirse yılın tamamını, dosya adında yılı kullanır", async () => {
    await seed();
    loginAs("ADMIN");

    const response = await call("?year=2026");

    expect(response.headers.get("content-disposition")).toBe('attachment; filename="finans-2026.csv"');
    expect(await response.text()).toContain("Ekipman");
  });

  it("hiçbir parametre verilmezse bu ayı verir ve hata vermez", async () => {
    loginAs("VIEWER");
    const response = await call();
    const now = new Date();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain(`finans-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}.csv`);
  });

  it("geçersiz ay 400 verir", async () => {
    loginAs("ADMIN");
    expect((await call("?year=2026&month=13")).status).toBe(400);
  });

  it("Operasyon finans verisini indiremez (403), oturumsuz istek 401 alır", async () => {
    await seed();
    loginAs("OPERATIONS");
    expect((await call("?year=2026&month=9")).status).toBe(403);

    authMock.mockResolvedValue(null);
    expect((await call("?year=2026&month=9")).status).toBe(401);
  });
});
