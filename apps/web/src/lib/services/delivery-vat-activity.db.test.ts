import { beforeEach, describe, expect, it } from "vitest";
import { flushAuditQueue, prisma } from "@/lib/prisma";
import { makeCustomer, makePlan, resetDb, shootDefaults, taskDefaults } from "@/test/db-helpers";
import { createUser } from "./user-service";
import { addChecklistItem, createShoot, getShootById, removeChecklistItem, setChecklistItemDone, updateShoot } from "./shoot-service";
import { createTransaction, monthlySummary } from "./finance-service";
import { ensureCurrentMonthInstance, markPaymentInstancePaid } from "./payment-plan-service";
import { getCustomerActivity } from "./activity-service";

beforeEach(resetDb);

const ops = () => createUser({ name: "Operasyon", email: "op@sosyalcan.local", password: "sifre-123456", role: "OPERATIONS" });

describe("çekim teslim kontrol listesi ve revizyon sayısı", () => {
  it("yeni çekime admin'in şablon maddeleri sırasıyla kopyalanır; kaldırılmış şablon maddesi gelmez", async () => {
    await prisma.optionItem.update({ where: { id: "opt_check_link" }, data: { archivedAt: new Date() } });
    const shoot = await createShoot({ scheduledAt: "2026-10-10T10:00" });
    expect(shoot.checklist.map((c) => c.label)).toEqual(["Ham görüntüler yedeklendi", "Kurgu tamamlandı", "Müşteri onayı alındı"]);
    expect(shoot.checklist.every((c) => !c.done)).toBe(true);
    expect(shoot.revisionCount).toBe(0);
  });

  it("şablon sonradan değişse de var olan çekimin listesi korunur", async () => {
    const shoot = await createShoot({ scheduledAt: "2026-10-10T10:00" });
    await prisma.optionItem.update({ where: { id: "opt_check_edit" }, data: { label: "Renk düzeltme yapıldı" } });
    expect((await getShootById(shoot.id)).checklist.map((c) => c.label)).toContain("Kurgu tamamlandı");
  });

  it("işaretleme kimin ve ne zaman yaptığını saklar; işaret kaldırılınca temizlenir", async () => {
    const user = await ops();
    const shoot = await createShoot({ scheduledAt: "2026-10-10T10:00" });
    const item = shoot.checklist[0];

    await setChecklistItemDone(shoot.id, item.id, true, user.id);
    let current = (await getShootById(shoot.id)).checklist[0];
    expect(current).toMatchObject({ done: true, doneBy: { name: "Operasyon" } });
    expect(current.doneAt).toBeInstanceOf(Date);

    await setChecklistItemDone(shoot.id, item.id, false, user.id);
    current = (await getShootById(shoot.id)).checklist[0];
    expect(current).toMatchObject({ done: false, doneAt: null, doneBy: null });
  });

  it("çekime özel madde eklenir/kaldırılır; başka çekimin maddesi ve arşivli çekim reddedilir", async () => {
    const a = await createShoot({ scheduledAt: "2026-10-10T10:00" });
    const b = await createShoot({ scheduledAt: "2026-10-11T10:00" });

    const extra = await addChecklistItem(a.id, "  Logo animasyonu eklendi ");
    expect(extra.label).toBe("Logo animasyonu eklendi");
    expect((await getShootById(a.id)).checklist.at(-1)?.label).toBe("Logo animasyonu eklendi");

    await expect(removeChecklistItem(b.id, extra.id)).rejects.toMatchObject({ status: 404 });
    await removeChecklistItem(a.id, extra.id);
    expect((await getShootById(a.id)).checklist).toHaveLength(4);

    await prisma.shoot.update({ where: { id: a.id }, data: { archivedAt: new Date() } });
    await expect(addChecklistItem(a.id, "Geç madde")).rejects.toMatchObject({ status: 400 });
  });

  it("revizyon sayısı güncellenir", async () => {
    const shoot = await prisma.shoot.create({ data: { scheduledAt: new Date(), ...shootDefaults } });
    expect((await updateShoot(shoot.id, { revisionCount: 2 })).revisionCount).toBe(2);
  });
});

describe("KDV ve fatura numarası", () => {
  it("KDV dahil tutardan KDV payı hesaplanıp saklanır; aylık özet ödenecek KDV'yi verir", async () => {
    const income = await createTransaction({ type: "INCOME", amountKurus: 120_000, vatRate: 20, invoiceNo: " ABC2026 ", occurredAt: "2026-03-10T10:00" });
    expect(income).toMatchObject({ vatRate: 20, vatAmount: 20_000, invoiceNo: "ABC2026" });
    await createTransaction({ type: "EXPENSE", amountKurus: 11_000, vatRate: 10, occurredAt: "2026-03-12T10:00" });
    await createTransaction({ type: "EXPENSE", amountKurus: 5_000, occurredAt: "2026-03-13T10:00" }); // KDV belirtilmedi

    expect(await monthlySummary(2026, 3)).toMatchObject({ vatCollectedKurus: 20_000, vatPaidKurus: 1_000, vatPayableKurus: 19_000 });
  });

  it("'ödeme alındı' planın KDV oranını ve girilen fatura numarasını gelir kaydına aktarır", async () => {
    const customer = await makeCustomer();
    const plan = await makePlan(customer.id, { monthlyAmount: 600_000 });
    await prisma.paymentPlan.update({ where: { id: plan.id }, data: { vatRate: 20 } });
    const instance = await ensureCurrentMonthInstance(plan.id);

    const { transaction } = await markPaymentInstancePaid(instance.id, { invoiceNo: "FTR-1" });

    expect(transaction).toMatchObject({ vatRate: 20, vatAmount: 100_000, invoiceNo: "FTR-1" });
  });
});

describe("müşteri aktivite geçmişi", () => {
  it("müşteriye ve bağlı kayıtlara yapılanları en yeni üstte verir; finans yalnızca izinli rolde", async () => {
    const customer = await makeCustomer("Atlas");
    await prisma.customer.update({ where: { id: customer.id }, data: { contact: "0555" } });
    await prisma.task.create({ data: { title: "Reels kurgusu", customerId: customer.id, ...taskDefaults } });
    await createTransaction({ type: "INCOME", amountKurus: 10_000, customerId: customer.id });
    const other = await makeCustomer("Başka");
    await prisma.task.create({ data: { title: "Başka görev", customerId: other.id, ...taskDefaults } });
    await flushAuditQueue();

    const forFinance = await getCustomerActivity(customer.id, { includeFinance: true });
    expect(forFinance.map((a) => a.entity)).toEqual(["Finans kaydı", "Görev", "Müşteri", "Müşteri"]);
    expect(forFinance.some((a) => a.summary?.includes("Başka görev"))).toBe(false);

    const forOperations = await getCustomerActivity(customer.id, { includeFinance: false });
    expect(forOperations.map((a) => a.entity)).not.toContain("Finans kaydı");
  });
});
