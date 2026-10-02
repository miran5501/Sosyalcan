import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { resetDb } from "@/test/db-helpers";
import { monthlyExpenseByCategory } from "./finance-service";

beforeEach(resetDb);

const at = (day: number, month = 3) => new Date(2026, month - 1, day, 12);
const expense = (amount: number, category: string | null, when = at(10)) => ({ type: "EXPENSE" as const, amount, category, occurredAt: when });

describe("monthlyExpenseByCategory", () => {
  it("giderleri kategoriye göre toplar, büyükten küçüğe sıralar, yüzdeleri hesaplar", async () => {
    await prisma.transaction.createMany({
      data: [expense(60_000, "Kira"), expense(30_000, "Ekipman"), expense(10_000, "Ekipman"), expense(100_000, "Personel")],
    });

    const result = await monthlyExpenseByCategory(2026, 3);

    expect(result.totalKurus).toBe(200_000);
    expect(result.categories).toEqual([
      { category: "Personel", amountKurus: 100_000, count: 1, percent: 50 },
      { category: "Kira", amountKurus: 60_000, count: 1, percent: 30 },
      { category: "Ekipman", amountKurus: 40_000, count: 2, percent: 20 },
    ]);
  });

  it("büyük/küçük harf ve boşluk farkını tek kategori sayar", async () => {
    await prisma.transaction.createMany({ data: [expense(1000, "Kira"), expense(2000, "kira "), expense(500, " KİRA")] });

    const { categories } = await monthlyExpenseByCategory(2026, 3);

    expect(categories).toHaveLength(1);
    expect(categories[0]).toMatchObject({ amountKurus: 3500, count: 3 });
  });

  it("büyük I ile yazılan kategori de aynı kategori sayılır (KIRA = Kira; Türkçe küçültmeyle kıra olurdu)", async () => {
    await prisma.transaction.createMany({ data: [expense(1000, "Kira"), expense(2000, "KIRA")] });

    const { categories } = await monthlyExpenseByCategory(2026, 3);

    expect(categories).toHaveLength(1);
    expect(categories[0].amountKurus).toBe(3000);
  });

  it("kategorisiz (boş veya null) giderleri 'Kategorisiz' altında toplar", async () => {
    await prisma.transaction.createMany({ data: [expense(1000, null), expense(2000, ""), expense(3000, "   ")] });

    const { categories } = await monthlyExpenseByCategory(2026, 3);

    expect(categories).toEqual([{ category: "Kategorisiz", amountKurus: 6000, count: 3, percent: 100 }]);
  });

  it("gelirleri ve başka aylardaki giderleri katmaz", async () => {
    await prisma.transaction.createMany({
      data: [
        expense(5000, "Kira"),
        { type: "INCOME", amount: 999_999, category: "Kira", occurredAt: at(11) },
        expense(7777, "Kira", at(28, 2)),
        expense(8888, "Kira", at(1, 4)),
      ],
    });

    expect(await monthlyExpenseByCategory(2026, 3)).toMatchObject({ totalKurus: 5000 });
  });

  it("gider yoksa boş liste ve sıfır toplam döner", async () => {
    expect(await monthlyExpenseByCategory(2026, 3)).toEqual({ totalKurus: 0, categories: [] });
  });

  it("yüzdeyi bir ondalıkla yuvarlar", async () => {
    await prisma.transaction.createMany({ data: [expense(1, "A"), expense(2, "B")] });

    const { categories } = await monthlyExpenseByCategory(2026, 3);

    expect(categories.map((c) => c.percent)).toEqual([66.7, 33.3]);
  });
});
