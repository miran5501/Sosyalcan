import { prisma } from "@/lib/prisma";
import { vatFromGross } from "@/lib/vat";
import { ApiError } from "@/lib/api-error";
import { assertSelectable } from "@/lib/services/option-service";
import type { CreatePaymentPlanInput, UpdatePaymentPlanInput } from "@/lib/validations/finance";

export async function listPaymentPlans(includeArchived = false) {
  return prisma.paymentPlan.findMany({
    where: includeArchived ? {} : { archivedAt: null },
    include: {
      customer: { select: { id: true, name: true } },
      instances: { orderBy: [{ year: "desc" }, { month: "desc" }], take: 6 },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPaymentPlanById(id: string) {
  const plan = await prisma.paymentPlan.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true } },
      instances: { orderBy: [{ year: "desc" }, { month: "desc" }] },
    },
  });
  if (!plan) {
    throw new ApiError(404, "Ödeme planı bulunamadı");
  }
  return plan;
}

export async function createPaymentPlan(input: CreatePaymentPlanInput) {
  return prisma.paymentPlan.create({
    data: {
      customerId: input.customerId,
      title: input.title,
      monthlyAmount: input.monthlyAmountKurus,
      billingDay: input.billingDay,
      vatRate: input.vatRate,
    },
  });
}

export async function updatePaymentPlan(id: string, input: UpdatePaymentPlanInput) {
  await getPaymentPlanById(id);
  return prisma.paymentPlan.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.monthlyAmountKurus !== undefined ? { monthlyAmount: input.monthlyAmountKurus } : {}),
      ...(input.billingDay !== undefined ? { billingDay: input.billingDay } : {}),
      ...(input.vatRate !== undefined ? { vatRate: input.vatRate } : {}),
    },
  });
}

export async function archivePaymentPlan(id: string) {
  await getPaymentPlanById(id);
  return prisma.paymentPlan.update({ where: { id }, data: { archivedAt: new Date() } });
}

export async function restorePaymentPlan(id: string) {
  await getPaymentPlanById(id);
  return prisma.paymentPlan.update({ where: { id }, data: { archivedAt: null } });
}

/**
 * Bu ay icin PaymentInstance yoksa olusturur. "PaymentPlan basina ayda
 * yalnizca bir PaymentInstance" kurali unique(planId, year, month)
 * constraint'i ile veritabani seviyesinde de garanti altinda; burada
 * once kontrol ederek gereksiz hata firlatmayi onluyoruz.
 */
export async function ensureCurrentMonthInstance(planId: string) {
  const plan = await getPaymentPlanById(planId);
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const existing = await prisma.paymentInstance.findUnique({
    where: { paymentPlanId_year_month: { paymentPlanId: planId, year, month } },
  });
  if (existing) {
    return existing;
  }

  return prisma.paymentInstance.create({
    data: {
      paymentPlanId: planId,
      year,
      month,
      amount: plan.monthlyAmount,
    },
  });
}

/**
 * Zamanlanmış (cron) üretim: aktif her plan için bu ayın örneğini tek sorguda oluşturur.
 * `skipDuplicates` veritabanındaki unique(plan, yıl, ay) kısıtına dayanır; bu yüzden
 * tekrar çalıştırmak ya da iki çalıştırmanın çakışması güvenlidir (var olan atlanır,
 * ödenmiş olanlara dokunulmaz). Günlük çalıştığı için ay ortasında eklenen planlar da ertesi gün alınır.
 */
export async function generateMonthlyInstances(now: Date = new Date()) {
  const plans = await prisma.paymentPlan.findMany({
    where: { archivedAt: null },
    select: { id: true, monthlyAmount: true },
  });
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const result = await prisma.paymentInstance.createMany({
    data: plans.map((p) => ({ paymentPlanId: p.id, year, month, amount: p.monthlyAmount })),
    skipDuplicates: true,
  });

  return { year, month, plans: plans.length, created: result.count };
}

export async function generateCurrentMonthInstancesForAllPlans() {
  const plans = await prisma.paymentPlan.findMany({ where: { archivedAt: null }, select: { id: true } });
  const results = [];
  for (const p of plans) {
    results.push(await ensureCurrentMonthInstance(p.id));
  }
  return results;
}

/**
 * KRITIK KURAL: "odeme alindi" isaretlemesi, PaymentInstance
 * guncellemesi + Transaction (gelir) olusturmasini TEK DB transaction'i
 * icinde yapmali — yarim kalmis kayit olmamali. Ikisinden biri basarisiz
 * olursa otekisi de geri alinir (prisma.$transaction).
 */
export async function markPaymentInstancePaid(instanceId: string, options: { paymentMethodId?: string; invoiceNo?: string } = {}) {
  // Ödeme yöntemi (isteğe bağlı) admin'in "Ödeme Yöntemleri" listesinden; gelir kaydına yazılır.
  const paymentMethodId = options.paymentMethodId ? await assertSelectable(options.paymentMethodId, ["PAYMENT_METHOD"]) : undefined;
  const instance = await prisma.paymentInstance.findUnique({
    where: { id: instanceId },
    include: { paymentPlan: { include: { customer: true } } },
  });
  if (!instance) {
    throw new ApiError(404, "Ödeme örneği bulunamadı");
  }
  if (instance.status === "PAID") {
    throw new ApiError(409, "Bu ödeme zaten alındı olarak işaretlenmiş");
  }

  return prisma.$transaction(async (tx) => {
    const updatedInstance = await tx.paymentInstance.update({
      where: { id: instanceId },
      data: { status: "PAID", paidAt: new Date() },
    });

    const transaction = await tx.transaction.create({
      data: {
        type: "INCOME",
        amount: instance.amount,
        category: "Ödeme Planı",
        description: `${instance.paymentPlan.title} — ${instance.month}/${instance.year}`,
        customerId: instance.paymentPlan.customerId,
        counterparty: instance.paymentPlan.customer.name,
        paymentMethodId,
        // Planın KDV oranı gelir kaydına aktarılır (tutar KDV dahil).
        vatRate: instance.paymentPlan.vatRate,
        vatAmount: instance.paymentPlan.vatRate !== null ? vatFromGross(instance.amount, instance.paymentPlan.vatRate) : null,
        invoiceNo: options.invoiceNo?.trim() || null,
        paymentInstanceId: instance.id,
      },
    });

    return { instance: updatedInstance, transaction };
  });
}

/**
 * Bir planın bütün ödeme geçmişi (yıllar içinde hiçbir dönem kaybolmaz): her ay için vade günü,
 * tutar, durum, ödendiyse tarih-saat ve ödeme yöntemi (bağlı gelir kaydından); yıllara göre gruplu
 * ve toplamlarıyla. Gecikme vade gününe bakılarak okuma anında hesaplanır.
 */
export async function getPlanHistory(id: string, now: Date = new Date()) {
  const plan = await prisma.paymentPlan.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true } },
      instances: {
        orderBy: [{ year: "desc" }, { month: "desc" }],
        include: { transaction: { select: { id: true, occurredAt: true, paymentMethod: { select: { label: true } } } } },
      },
    },
  });
  if (!plan) {
    throw new ApiError(404, "Ödeme planı bulunamadı");
  }

  const rows = plan.instances.map((i) => {
    const dueDate = new Date(i.year, i.month - 1, plan.billingDay, 23, 59, 59);
    const overdue = i.status !== "PAID" && dueDate < now;
    return {
      id: i.id,
      year: i.year,
      month: i.month,
      dueDate,
      amountKurus: i.amount,
      status: i.status === "PAID" ? ("PAID" as const) : overdue ? ("OVERDUE" as const) : ("PENDING" as const),
      paidAt: i.paidAt,
      paymentMethod: i.transaction?.paymentMethod?.label ?? null,
    };
  });

  const sum = (list: typeof rows, pick: (r: (typeof rows)[number]) => boolean) =>
    list.filter(pick).reduce((total, r) => total + r.amountKurus, 0);
  const years = [...new Set(rows.map((r) => r.year))].map((year) => {
    const list = rows.filter((r) => r.year === year);
    return {
      year,
      rows: list,
      paidKurus: sum(list, (r) => r.status === "PAID"),
      openKurus: sum(list, (r) => r.status !== "PAID"),
    };
  });

  return {
    plan: { id: plan.id, title: plan.title, monthlyAmount: plan.monthlyAmount, billingDay: plan.billingDay, archivedAt: plan.archivedAt, createdAt: plan.createdAt, customer: plan.customer },
    totals: {
      paidKurus: sum(rows, (r) => r.status === "PAID"),
      overdueKurus: sum(rows, (r) => r.status === "OVERDUE"),
      pendingKurus: sum(rows, (r) => r.status === "PENDING"),
      paidCount: rows.filter((r) => r.status === "PAID").length,
      periodCount: rows.length,
    },
    years,
  };
}
