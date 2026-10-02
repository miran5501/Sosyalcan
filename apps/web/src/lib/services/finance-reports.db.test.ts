import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { makeCustomer, makePlan, resetDb } from "@/test/db-helpers";
import { createTransaction, listCounterparties, listTransactions, yearlyReport, yearsOverview } from "./finance-service";
import { archiveOption, createOption } from "./option-service";
import { getPlanHistory, markPaymentInstancePaid } from "./payment-plan-service";

beforeEach(resetDb);

const at = (y: number, m: number, d = 10, h = 12, min = 0) => new Date(y, m - 1, d, h, min);

async function methods() {
  const cash = await createOption({ kind: "PAYMENT_METHOD", label: "Nakit" });
  const wire = await createOption({ kind: "PAYMENT_METHOD", label: "Havale" });
  await createOption({ kind: "FINANCE_CATEGORY", label: "Kira" });
  await createOption({ kind: "FINANCE_CATEGORY", label: "Ekipman" });
  return { cash, wire };
}

describe("finans kaydı ayrıntıları", () => {
  it("tarih-saat, kime/kimden ve ödeme yöntemiyle kaydedilir", async () => {
    const { wire } = await methods();
    const t = await createTransaction({
      type: "EXPENSE",
      amountKurus: 1_500_000,
      category: "Kira",
      counterparty: "  Ev sahibi  ",
      paymentMethodId: wire.id,
      occurredAt: "2026-10-03T14:35",
    });
    expect([t.counterparty, t.paymentMethod?.label, t.occurredAt.getHours(), t.occurredAt.getMinutes()]).toEqual(["Ev sahibi", "Havale", 14, 35]);
  });

  it("ödeme yöntemi yalnızca aktif ödeme yöntemleri listesinden olabilir", async () => {
    const { cash } = await methods();
    await expect(createTransaction({ type: "INCOME", amountKurus: 100, paymentMethodId: "opt_type_video" })).rejects.toMatchObject({ status: 400 });
    await archiveOption(cash.id);
    await expect(createTransaction({ type: "INCOME", amountKurus: 100, paymentMethodId: cash.id })).rejects.toMatchObject({ status: 400 });
  });

  it("kime/kimden önerileri en çok kullanılandan başlar, boşlar gelmez", async () => {
    await createTransaction({ type: "EXPENSE", amountKurus: 1, counterparty: "Kurgucu" });
    await createTransaction({ type: "EXPENSE", amountKurus: 1, counterparty: "Ev sahibi" });
    await createTransaction({ type: "EXPENSE", amountKurus: 1, counterparty: "Ev sahibi" });
    await createTransaction({ type: "EXPENSE", amountKurus: 1 });
    expect(await listCounterparties()).toEqual(["Ev sahibi", "Kurgucu"]);
  });
});

describe("finans listesi süzgeçleri", () => {
  async function seedMonth() {
    const { cash, wire } = await methods();
    const customer = await makeCustomer("Lezzet Durağı");
    await createTransaction({ type: "EXPENSE", amountKurus: 1000, category: "Kira", counterparty: "Ev sahibi", paymentMethodId: wire.id, occurredAt: at(2026, 9).toISOString() });
    await createTransaction({ type: "EXPENSE", amountKurus: 2000, category: "Ekipman", description: "Gimbal", paymentMethodId: cash.id, occurredAt: at(2026, 9, 12).toISOString() });
    await createTransaction({ type: "INCOME", amountKurus: 5000, description: "Aylık ücret", customerId: customer.id, occurredAt: at(2026, 9, 15).toISOString() });
    await createTransaction({ type: "EXPENSE", amountKurus: 9999, category: "Kira", occurredAt: at(2026, 8).toISOString() }); // başka ay
    return { cash, wire };
  }
  const descs = (rows: { description: string | null; counterparty: string | null; amount: number }[]) => rows.map((r) => r.amount);

  it("tür, kategori, kategorisiz ve ödeme yöntemine göre süzer; dönem dışını getirmez", async () => {
    const { cash } = await seedMonth();
    expect(descs(await listTransactions({ year: 2026, month: 9 }))).toEqual([5000, 2000, 1000]);
    expect(descs(await listTransactions({ year: 2026, month: 9, type: "EXPENSE" }))).toEqual([2000, 1000]);
    expect(descs(await listTransactions({ year: 2026, month: 9, category: "Kira" }))).toEqual([1000]);
    expect(descs(await listTransactions({ year: 2026, month: 9, category: "__none__" }))).toEqual([5000]);
    expect(descs(await listTransactions({ year: 2026, month: 9, paymentMethodId: cash.id }))).toEqual([2000]);
  });

  it("arama açıklamada, kime/kimden'de ve müşteri adında büyük/küçük harf duyarsız çalışır", async () => {
    await seedMonth();
    expect(descs(await listTransactions({ year: 2026, month: 9, q: "gimbal" }))).toEqual([2000]);
    expect(descs(await listTransactions({ year: 2026, month: 9, q: "EV SAH" }))).toEqual([1000]);
    expect(descs(await listTransactions({ year: 2026, month: 9, q: "lezzet" }))).toEqual([5000]);
  });
});

describe("yıllık rapor ve yıllar karşılaştırması", () => {
  it("12 ayın gelir/gider/net'ini, yıl toplamını ve yönteme göre dağılımı verir", async () => {
    const { wire } = await methods();
    await createTransaction({ type: "INCOME", amountKurus: 10_000, paymentMethodId: wire.id, occurredAt: at(2026, 1).toISOString() });
    await createTransaction({ type: "EXPENSE", amountKurus: 3_000, category: "Kira", occurredAt: at(2026, 1, 20).toISOString() });
    await createTransaction({ type: "EXPENSE", amountKurus: 4_000, category: "Kira", occurredAt: at(2026, 12, 31, 23, 59).toISOString() });
    await createTransaction({ type: "INCOME", amountKurus: 99_999, occurredAt: at(2025, 12, 31).toISOString() }); // başka yıl

    const report = await yearlyReport(2026);

    expect(report.total).toEqual({ incomeKurus: 10_000, expenseKurus: 7_000, netKurus: 3_000, count: 3 });
    expect(report.months[0]).toMatchObject({ month: 1, incomeKurus: 10_000, expenseKurus: 3_000, netKurus: 7_000, count: 2 });
    expect(report.months[11]).toMatchObject({ month: 12, expenseKurus: 4_000, count: 1 });
    expect(report.months.slice(1, 11).every((m) => m.count === 0)).toBe(true);
    expect(report.expenses.categories).toEqual([{ category: "Kira", amountKurus: 7_000, count: 2, percent: 100 }]);
    expect(report.methods.map((m) => [m.label, m.incomeKurus, m.expenseKurus])).toEqual([
      ["Havale", 10_000, 0],
      ["Belirtilmemiş", 0, 7_000],
    ]);
  });

  it("kaydı olan her yılı yeniden eskiye özetler", async () => {
    for (const [y, type, amount] of [
      [2024, "INCOME", 100],
      [2026, "INCOME", 500],
      [2026, "EXPENSE", 200],
      [2025, "EXPENSE", 50],
    ] as const) {
      await prisma.transaction.create({ data: { type, amount, occurredAt: at(y, 6) } });
    }
    expect(await yearsOverview()).toEqual([
      { year: 2026, incomeKurus: 500, expenseKurus: 200, netKurus: 300, count: 2 },
      { year: 2025, incomeKurus: 0, expenseKurus: 50, netKurus: -50, count: 1 },
      { year: 2024, incomeKurus: 100, expenseKurus: 0, netKurus: 100, count: 1 },
    ]);
  });
});

describe("ödeme planı geçmişi", () => {
  async function planWithHistory() {
    const { wire } = await methods();
    const customer = await makeCustomer("Mavi Kırtasiye");
    const plan = await makePlan(customer.id, { title: "İçerik Paketi", monthlyAmount: 350_000, billingDay: 15 });
    const mk = (year: number, month: number) => prisma.paymentInstance.create({ data: { paymentPlanId: plan.id, year, month, amount: 350_000 } });
    const dec = await mk(2025, 12);
    const jan = await mk(2026, 1);
    await mk(2026, 2);
    await mk(2099, 1); // vadesi gelmemiş
    await markPaymentInstancePaid(dec.id, { paymentMethodId: wire.id });
    await markPaymentInstancePaid(jan.id);
    return { plan, customer };
  }

  it("ödeme alındı: gelir kaydına yöntem ve müşteri adı (kimden) yazılır", async () => {
    const { customer } = await planWithHistory();
    const income = await prisma.transaction.findFirstOrThrow({ where: { description: { contains: "12/2025" } }, include: { paymentMethod: true } });
    expect([income.paymentMethod?.label, income.counterparty, income.customerId]).toEqual(["Havale", "Mavi Kırtasiye", customer.id]);
  });

  it("bütün dönemleri yıllara göre, durum, ödeme tarihi ve yöntemle, toplamlarıyla verir", async () => {
    const { plan } = await planWithHistory();
    const history = await getPlanHistory(plan.id, new Date(2026, 5, 1));

    expect(history.years.map((y) => y.year)).toEqual([2099, 2026, 2025]);
    const y2026 = history.years.find((y) => y.year === 2026)!;
    expect(y2026.rows.map((r) => [r.month, r.status, r.paymentMethod])).toEqual([
      [2, "OVERDUE", null],
      [1, "PAID", null],
    ]);
    expect(y2026.rows[1].paidAt).toBeInstanceOf(Date);
    expect(history.years.find((y) => y.year === 2025)!.rows[0]).toMatchObject({ status: "PAID", paymentMethod: "Havale" });
    expect(history.totals).toEqual({ paidKurus: 700_000, overdueKurus: 350_000, pendingKurus: 350_000, paidCount: 2, periodCount: 4 });
  });

  it("olmayan plan 404", async () => {
    await expect(getPlanHistory("olmayan-id")).rejects.toMatchObject({ status: 404 });
  });

  it("ödeme alındıda başka listeden yöntem verilemez; ödeme işaretlenmez", async () => {
    const customer = await makeCustomer();
    const plan = await makePlan(customer.id);
    const instance = await prisma.paymentInstance.create({ data: { paymentPlanId: plan.id, year: 2026, month: 9, amount: 1000 } });
    await expect(markPaymentInstancePaid(instance.id, { paymentMethodId: "opt_task_done" })).rejects.toMatchObject({ status: 400 });
    expect((await prisma.paymentInstance.findUniqueOrThrow({ where: { id: instance.id } })).status).toBe("PENDING");
  });
});
