import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { daysFromToday, makeCustomer, makePlan, resetDb } from "@/test/db-helpers";
import { monthlySummary } from "./finance-service";
import {
  ensureCurrentMonthInstance,
  generateCurrentMonthInstancesForAllPlans,
  markPaymentInstancePaid,
  updatePaymentPlan,
} from "./payment-plan-service";
import { calculateRevenueShare, listPartners, replacePartners } from "./revenue-share-service";

beforeEach(resetDb);

describe("ödeme örneği üretimi (ayda tek örnek kuralı)", () => {
  it("bu ay için plan tutarında, bekleyen bir örnek oluşturur", async () => {
    const customer = await makeCustomer();
    const plan = await makePlan(customer.id, { monthlyAmount: 420_000 });

    const instance = await ensureCurrentMonthInstance(plan.id);

    const now = new Date();
    expect(instance.year).toBe(now.getFullYear());
    expect(instance.month).toBe(now.getMonth() + 1);
    expect(instance.amount).toBe(420_000);
    expect(instance.status).toBe("PENDING");
  });

  it("aynı ay için tekrar çağrılınca yeni kayıt açmaz", async () => {
    const plan = await makePlan((await makeCustomer()).id);

    const first = await ensureCurrentMonthInstance(plan.id);
    const second = await ensureCurrentMonthInstance(plan.id);

    expect(second.id).toBe(first.id);
    expect(await prisma.paymentInstance.count()).toBe(1);
  });

  it("veritabanı da aynı plan+ay için ikinci kaydı reddeder (unique kısıtı)", async () => {
    const plan = await makePlan((await makeCustomer()).id);
    const data = { paymentPlanId: plan.id, year: 2026, month: 3, amount: 1000 };
    await prisma.paymentInstance.create({ data });

    await expect(prisma.paymentInstance.create({ data })).rejects.toMatchObject({ code: "P2002" });
  });

  it("arşivlenmiş planlar için toplu üretimde örnek oluşturmaz", async () => {
    const customer = await makeCustomer();
    await makePlan(customer.id, { title: "Aktif" });
    await makePlan(customer.id, { title: "Arşivli", archivedAt: new Date() });

    const results = await generateCurrentMonthInstancesForAllPlans();

    expect(results).toHaveLength(1);
    expect(await prisma.paymentInstance.count()).toBe(1);
  });

  it("plan tutarı sonradan değişse de üretilmiş örneğin tutarı sabit kalır", async () => {
    const plan = await makePlan((await makeCustomer()).id, { monthlyAmount: 100_000 });
    const instance = await ensureCurrentMonthInstance(plan.id);

    await updatePaymentPlan(plan.id, { monthlyAmountKurus: 999_000 });

    const stored = await prisma.paymentInstance.findUniqueOrThrow({ where: { id: instance.id } });
    expect(stored.amount).toBe(100_000);
  });
});

describe("markPaymentInstancePaid ('ödeme alındı' tek transaction kuralı)", () => {
  async function pendingInstance(amount = 350_000) {
    const customer = await makeCustomer("Mavi Kırtasiye");
    const plan = await makePlan(customer.id, { monthlyAmount: amount });
    return { customer, plan, instance: await ensureCurrentMonthInstance(plan.id) };
  }

  it("örneği ödendi yapar ve aynı tutarda bir gelir kaydı üretir", async () => {
    const { customer, instance } = await pendingInstance(350_000);

    const result = await markPaymentInstancePaid(instance.id);

    expect(result.instance.status).toBe("PAID");
    expect(result.instance.paidAt).toBeInstanceOf(Date);
    expect(result.transaction).toMatchObject({
      type: "INCOME",
      amount: 350_000,
      customerId: customer.id,
      paymentInstanceId: instance.id,
      category: "Ödeme Planı",
    });
    expect(await prisma.transaction.count()).toBe(1);
  });

  it("ikinci kez işaretlenemez (409) ve ikinci gelir kaydı oluşmaz", async () => {
    const { instance } = await pendingInstance();
    await markPaymentInstancePaid(instance.id);

    await expect(markPaymentInstancePaid(instance.id)).rejects.toMatchObject({ status: 409 });
    expect(await prisma.transaction.count()).toBe(1);
  });

  it("olmayan örnek için 404 verir", async () => {
    await expect(markPaymentInstancePaid("olmayan-id")).rejects.toMatchObject({ status: 404 });
  });

  it("gelir kaydı oluşturulamazsa örnek güncellemesi de geri alınır (yarım kayıt kalmaz)", async () => {
    const { plan, instance } = await pendingInstance();
    // Aynı ödeme örneğine bağlı bir işlem zaten varsa yenisi unique kısıtına takılır.
    await prisma.transaction.create({
      data: { type: "INCOME", amount: 1, paymentInstanceId: instance.id, customerId: plan.customerId },
    });

    await expect(markPaymentInstancePaid(instance.id)).rejects.toBeDefined();

    const stored = await prisma.paymentInstance.findUniqueOrThrow({ where: { id: instance.id } });
    expect(stored.status).toBe("PENDING");
    expect(stored.paidAt).toBeNull();
    expect(await prisma.transaction.count()).toBe(1);
  });
});

describe("monthlySummary (aylık gelir/gider özeti)", () => {
  const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min);

  it("yalnızca ilgili ayın kayıtlarını toplar; ay sınırları doğru", async () => {
    await prisma.transaction.createMany({
      data: [
        { type: "INCOME", amount: 100_000, occurredAt: at(2026, 3, 1, 0, 0) }, // ayın ilk anı: dahil
        { type: "INCOME", amount: 50_000, occurredAt: at(2026, 3, 31, 23, 59) }, // ayın son dakikası: dahil
        { type: "EXPENSE", amount: 30_000, occurredAt: at(2026, 3, 15) },
        { type: "INCOME", amount: 999_999, occurredAt: at(2026, 4, 1, 0, 0) }, // sonraki ay: hariç
        { type: "EXPENSE", amount: 888_888, occurredAt: at(2026, 2, 28, 23, 59) }, // önceki ay: hariç
      ],
    });

    expect(await monthlySummary(2026, 3)).toEqual({
      incomeKurus: 150_000,
      expenseKurus: 30_000,
      netKurus: 120_000,
      vatCollectedKurus: 0,
      vatPaidKurus: 0,
      vatPayableKurus: 0,
    });
  });

  it("kayıt yoksa sıfır döner, gider gelirden fazlaysa net eksi olur", async () => {
    expect(await monthlySummary(2026, 5)).toMatchObject({ incomeKurus: 0, expenseKurus: 0, netKurus: 0, vatPayableKurus: 0 });

    await prisma.transaction.create({ data: { type: "EXPENSE", amount: 5_000, occurredAt: at(2026, 5, 10) } });
    expect((await monthlySummary(2026, 5)).netKurus).toBe(-5_000);
  });
});

describe("gelir dağıtımı (veritabanı ile)", () => {
  it("ortak listesi bütün olarak değişir, eski ortaklar kalmaz", async () => {
    await replacePartners([
      { name: "A", sharePercent: 50 },
      { name: "B", sharePercent: 50 },
    ]);
    await replacePartners([
      { name: "C", sharePercent: 70 },
      { name: "D", sharePercent: 30 },
    ]);

    const partners = await listPartners();
    expect(partners.map((p) => p.name)).toEqual(["C", "D"]);
  });

  it("net ve brüt esasına göre aylık geliri ortaklara dağıtır; toplam korunur", async () => {
    await replacePartners([
      { name: "A", sharePercent: 60 },
      { name: "B", sharePercent: 40 },
    ]);
    await prisma.transaction.createMany({
      data: [
        { type: "INCOME", amount: 100_001, occurredAt: new Date(2026, 2, 10, 12) },
        { type: "EXPENSE", amount: 40_001, occurredAt: new Date(2026, 2, 12, 12) },
      ],
    });

    const net = await calculateRevenueShare(2026, 3, "net");
    expect(net.baseKurus).toBe(60_000);
    expect(net.shares.map((s) => s.amountKurus)).toEqual([36_000, 24_000]);

    const gross = await calculateRevenueShare(2026, 3, "gross");
    expect(gross.baseKurus).toBe(100_001);
    expect(gross.shares.reduce((sum, s) => sum + s.amountKurus, 0)).toBe(100_001);
  });
});

// Yardımcının tarih üretimi, testlerin gün/ay sınırlarında sessizce bozulmadığını garanti eder.
describe("test yardımcısı", () => {
  it("daysFromToday yerel takvim gününü ileri/geri öteler", () => {
    const today = new Date();
    expect(daysFromToday(0).getDate()).toBe(today.getDate());
    expect(daysFromToday(1).getTime()).toBeGreaterThan(daysFromToday(0).getTime());
  });
});
