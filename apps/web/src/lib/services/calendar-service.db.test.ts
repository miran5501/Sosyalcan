import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { makeCustomer, makePlan, resetDb } from "@/test/db-helpers";
import { listPaymentDues } from "./calendar-service";

beforeEach(resetDb);

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);
const NOW = new Date(2026, 8, 20, 10, 0); // 20 Eylül 2026

async function planWithInstance(billingDay: number, month: number, status: "PENDING" | "PAID" = "PENDING", amount = 350_000) {
  const customer = await makeCustomer("Mavi Kırtasiye");
  const plan = await makePlan(customer.id, { title: "İçerik Paketi", billingDay, monthlyAmount: amount });
  await prisma.paymentInstance.create({ data: { paymentPlanId: plan.id, year: 2026, month, amount, status } });
  return plan;
}

describe("listPaymentDues", () => {
  it("örneği olan vadeyi gerçek durumu ve tutarıyla, müşteri adıyla getirir", async () => {
    await planWithInstance(25, 9, "PAID", 420_000);

    const dues = await listPaymentDues(d(2026, 9, 1), d(2026, 10, 1), NOW);

    expect(dues).toHaveLength(1);
    expect(dues[0]).toMatchObject({ dueDate: d(2026, 9, 25), customerName: "Mavi Kırtasiye", amountKurus: 420_000, status: "PAID" });
  });

  it("aralık dışındaki vadeleri getirmez ([start, end): bitiş günü dahil değil)", async () => {
    await planWithInstance(25, 9);

    expect(await listPaymentDues(d(2026, 9, 26), d(2026, 10, 3), NOW)).toEqual([]);
    expect(await listPaymentDues(d(2026, 9, 18), d(2026, 9, 25), NOW)).toEqual([]); // 25'i dahil değil
    expect(await listPaymentDues(d(2026, 9, 25), d(2026, 9, 26), NOW)).toHaveLength(1);
  });

  it("örneği olmayan gelecekteki vadeyi 'planlı' olarak, plan tutarıyla gösterir", async () => {
    const customer = await makeCustomer();
    await makePlan(customer.id, { billingDay: 25, monthlyAmount: 100_000 });

    const dues = await listPaymentDues(d(2026, 9, 21), d(2026, 9, 28), NOW);
    expect(dues).toHaveLength(1);
    expect(dues[0]).toMatchObject({ status: "PLANNED", amountKurus: 100_000 });

    // Gelecek ay için de planlı görünür
    const october = await listPaymentDues(d(2026, 10, 1), d(2026, 11, 1), NOW);
    expect(october[0]).toMatchObject({ status: "PLANNED", dueDate: d(2026, 10, 25) });
  });

  it("örneği hiç oluşmamış GEÇMİŞ vadeyi göstermez", async () => {
    const customer = await makeCustomer();
    await makePlan(customer.id, { billingDay: 5 });

    expect(await listPaymentDues(d(2026, 9, 1), d(2026, 10, 1), NOW)).toEqual([]); // 5 Eylül geçmişte
    expect(await listPaymentDues(d(2026, 8, 1), d(2026, 9, 1), NOW)).toEqual([]);
  });

  it("arşivlenmiş planları göstermez", async () => {
    const customer = await makeCustomer();
    await makePlan(customer.id, { billingDay: 25, archivedAt: new Date() });

    expect(await listPaymentDues(d(2026, 9, 1), d(2026, 10, 1), NOW)).toEqual([]);
  });

  it("iki aya yayılan aralıkta her ayın vadesini vade sırasıyla getirir", async () => {
    const customer = await makeCustomer();
    await makePlan(customer.id, { title: "Ayın sonu", billingDay: 30 });
    await makePlan(customer.id, { title: "Ayın başı", billingDay: 2 });

    const dues = await listPaymentDues(d(2026, 9, 28), d(2026, 10, 5), NOW); // 28 Eylül - 4 Ekim

    expect(dues.map((x) => [x.planTitle, x.dueDate.getMonth() + 1, x.dueDate.getDate()])).toEqual([
      ["Ayın sonu", 9, 30],
      ["Ayın başı", 10, 2],
    ]);
  });
});
