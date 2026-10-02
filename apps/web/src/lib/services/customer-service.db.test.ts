import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { daysFromToday, makeCustomer, makePlan, resetDb, shootDefaults, taskDefaults } from "@/test/db-helpers";
import { getCustomerById, getCustomerOverview } from "./customer-service";

beforeEach(resetDb);

async function customerWithHistory() {
  const customer = await makeCustomer("Atlas Spor Merkezi");
  const other = await makeCustomer("Başka Müşteri");

  await prisma.task.createMany({
    data: [
      { ...taskDefaults, title: "Görev-1", customerId: customer.id },
      { ...taskDefaults, title: "Görev-arşivli", customerId: customer.id, archivedAt: new Date() },
      { ...taskDefaults, title: "Başkasının görevi", customerId: other.id },
    ],
  });
  await prisma.shoot.createMany({
    data: [
      { ...shootDefaults, typeId: "opt_type_video", scheduledAt: daysFromToday(-5), customerId: customer.id },
      { ...shootDefaults, typeId: "opt_type_drone", scheduledAt: daysFromToday(3), customerId: customer.id },
      { ...shootDefaults, typeId: "opt_type_other", scheduledAt: daysFromToday(1), customerId: customer.id, archivedAt: new Date() },
      { ...shootDefaults, scheduledAt: daysFromToday(1), customerId: other.id },
    ],
  });
  await prisma.appointment.createMany({
    data: [
      { title: "Toplantı", startsAt: daysFromToday(2), customerId: customer.id },
      { title: "Başkasının randevusu", startsAt: daysFromToday(2), customerId: other.id },
    ],
  });

  const plan = await makePlan(customer.id, { title: "İçerik Paketi", monthlyAmount: 350_000 });
  await makePlan(customer.id, { title: "Arşivli plan", archivedAt: new Date() });
  await prisma.paymentInstance.create({ data: { paymentPlanId: plan.id, year: 2026, month: 8, amount: 350_000, status: "PAID" } });
  await prisma.paymentInstance.create({ data: { paymentPlanId: plan.id, year: 2026, month: 9, amount: 350_000 } });
  await prisma.transaction.createMany({
    data: [
      { type: "INCOME", amount: 350_000, customerId: customer.id, occurredAt: daysFromToday(-20) },
      { type: "EXPENSE", amount: 40_000, customerId: customer.id, occurredAt: daysFromToday(-10) },
      { type: "INCOME", amount: 999_999, customerId: other.id },
    ],
  });
  return customer;
}

describe("getCustomerOverview", () => {
  it("yalnızca bu müşterinin arşivlenmemiş görev, çekim ve randevularını getirir", async () => {
    const customer = await customerWithHistory();

    const overview = await getCustomerOverview(customer.id, { includeFinance: false });

    expect(overview.customer.name).toBe("Atlas Spor Merkezi");
    expect(overview.tasks.map((t) => t.title)).toEqual(["Görev-1"]);
    expect(overview.shoots).toHaveLength(2);
    expect(overview.appointments.map((a) => a.title)).toEqual(["Toplantı"]);
  });

  it("çekimleri en yeniden eskiye sıralar", async () => {
    const customer = await customerWithHistory();

    const { shoots } = await getCustomerOverview(customer.id, { includeFinance: false });

    expect(shoots.map((s) => s.type.label)).toEqual(["Drone", "Video"]);
  });

  it("finans yetkisi yoksa finans verisi hiç dönmez", async () => {
    const customer = await customerWithHistory();
    expect((await getCustomerOverview(customer.id, { includeFinance: false })).finance).toBeNull();
  });

  it("finans yetkisiyle plan, ödeme örnekleri ve işlemler ile toplamları getirir (arşivli plan ve başka müşteri hariç)", async () => {
    const customer = await customerWithHistory();

    const { finance } = await getCustomerOverview(customer.id, { includeFinance: true });

    expect(finance!.plans.map((p) => p.title)).toEqual(["İçerik Paketi"]);
    expect(finance!.plans[0].instances.map((i) => [i.month, i.status])).toEqual([
      [9, "PENDING"],
      [8, "PAID"],
    ]);
    expect(finance!.transactions).toHaveLength(2);
    expect(finance!.incomeKurus).toBe(350_000);
    expect(finance!.expenseKurus).toBe(40_000);
  });

  it("hiç işlemi olmayan müşteride toplamlar sıfırdır", async () => {
    const customer = await makeCustomer();
    const { finance } = await getCustomerOverview(customer.id, { includeFinance: true });
    expect(finance).toMatchObject({ plans: [], transactions: [], incomeKurus: 0, expenseKurus: 0 });
  });

  it("olmayan müşteri için 404 verir", async () => {
    await expect(getCustomerOverview("olmayan", { includeFinance: true })).rejects.toMatchObject({ status: 404 });
  });
});

describe("getCustomerById: finans verisi varsayılan olarak kapalı", () => {
  it("varsayılan çağrıda ödeme planları dönmez", async () => {
    const customer = await customerWithHistory();
    expect(await getCustomerById(customer.id)).not.toHaveProperty("paymentPlans");
  });

  it("includeFinance ile yalnızca arşivlenmemiş ödeme planları döner", async () => {
    const customer = await customerWithHistory();
    const result = await getCustomerById(customer.id, { includeFinance: true });
    expect(result.paymentPlans.map((p) => p.title)).toEqual(["İçerik Paketi"]);
  });

  it("görev ve çekim listesinde arşivlenmişleri göstermez", async () => {
    const customer = await customerWithHistory();
    const result = await getCustomerById(customer.id);
    expect(result.tasks.map((t) => t.title)).toEqual(["Görev-1"]);
    expect(result.shoots).toHaveLength(2);
  });
});
