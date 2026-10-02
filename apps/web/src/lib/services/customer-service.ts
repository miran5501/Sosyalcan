import { prisma } from "@/lib/prisma";
import type { Customer, Prisma } from "@prisma/client";
import { type Page, pageArgs, toPage } from "@/lib/pagination";
import { shootInclude, withOrderedTargets } from "@/lib/services/shoot-service";
import { taskInclude } from "@/lib/services/task-service";
import { ApiError } from "@/lib/api-error";
import { foldCase } from "@/lib/tags";
import type { CreateCustomerInput, UpdateCustomerInput } from "@/lib/validations/customer";

function customerWhere(params: { search?: string; tag?: string; includeArchived?: boolean }): Prisma.CustomerWhereInput {
  return {
    archivedAt: params.includeArchived ? undefined : null,
    ...(params.tag ? { tags: { has: foldCase(params.tag.trim()) } } : {}),
    ...(params.search
      ? {
          OR: [
            { name: { contains: params.search, mode: "insensitive" } },
            { contact: { contains: params.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

/** Web listesi için sayfalı (25'er). API ve form seçim listeleri `listCustomers`'ı kullanır. */
export async function listCustomersPage(params: { search?: string; tag?: string; includeArchived?: boolean; page: number }): Promise<Page<Customer>> {
  const where = customerWhere(params);
  const [items, total] = await Promise.all([
    prisma.customer.findMany({ where, orderBy: { name: "asc" }, ...pageArgs(params.page) }),
    prisma.customer.count({ where }),
  ]);
  return toPage(items, total, params.page);
}

export async function listCustomers(params: { search?: string; tag?: string; includeArchived?: boolean }) {
  return prisma.customer.findMany({
    where: {
      archivedAt: params.includeArchived ? undefined : null,
      ...(params.tag ? { tags: { has: foldCase(params.tag.trim()) } } : {}),
      ...(params.search
        ? {
            OR: [
              { name: { contains: params.search, mode: "insensitive" } },
              { contact: { contains: params.search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
  });
}

/**
 * `includeFinance` yalnızca finans verisini görebilen roller için true verilmeli
 * (FINANCE_VIEW_ROLES). Varsayılan false: Operasyon rolü ödeme planı tutarlarını göremez
 * (yetki matrisi).
 */
export async function getCustomerById(id: string, options: { includeFinance?: boolean } = {}) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      tasks: { where: { archivedAt: null }, orderBy: { createdAt: "desc" }, take: 20 },
      shoots: { where: { archivedAt: null }, orderBy: { scheduledAt: "desc" }, take: 20 },
      ...(options.includeFinance
        ? {
            paymentPlans: {
              where: { archivedAt: null },
              include: { instances: { orderBy: [{ year: "desc" }, { month: "desc" }] } },
            },
          }
        : {}),
    },
  });

  if (!customer) {
    throw new ApiError(404, "Müşteri bulunamadı");
  }
  return customer;
}

export async function createCustomer(input: CreateCustomerInput) {
  return prisma.customer.create({ data: input });
}

export async function updateCustomer(id: string, input: UpdateCustomerInput) {
  await getCustomerById(id);
  return prisma.customer.update({ where: { id }, data: input });
}

export async function archiveCustomer(id: string) {
  await getCustomerById(id);
  return prisma.customer.update({ where: { id }, data: { archivedAt: new Date() } });
}

export async function restoreCustomer(id: string) {
  await getCustomerById(id);
  return prisma.customer.update({ where: { id }, data: { archivedAt: null } });
}

const OVERVIEW_LIMIT = 50;

/**
 * Müşteri detay sayfası: bu müşteriye ait görev, çekim, randevu ve (yetkiliyse) ödemeler tek yerde.
 * Arşivlenmiş kayıtlar listelenmez. `includeFinance` false ise finans verisi hiç okunmaz.
 */
export async function getCustomerOverview(id: string, options: { includeFinance: boolean }) {
  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) {
    throw new ApiError(404, "Müşteri bulunamadı");
  }

  const [tasks, shoots, appointments, finance] = await Promise.all([
    prisma.task.findMany({
      where: { customerId: id, archivedAt: null },
      include: taskInclude,
      orderBy: { createdAt: "desc" },
      take: OVERVIEW_LIMIT,
    }),
    prisma.shoot.findMany({
      where: { customerId: id, archivedAt: null },
      include: shootInclude,
      orderBy: { scheduledAt: "desc" },
      take: OVERVIEW_LIMIT,
    }).then((shoots) => shoots.map(withOrderedTargets)),
    prisma.appointment.findMany({
      where: { customerId: id, archivedAt: null },
      orderBy: { startsAt: "desc" },
      take: OVERVIEW_LIMIT,
    }),
    options.includeFinance ? loadCustomerFinance(id) : Promise.resolve(null),
  ]);

  return { customer, tasks, shoots, appointments, finance };
}

async function loadCustomerFinance(customerId: string) {
  const [plans, transactions, totals] = await Promise.all([
    prisma.paymentPlan.findMany({
      where: { customerId, archivedAt: null },
      include: { instances: { orderBy: [{ year: "desc" }, { month: "desc" }], take: 12 } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.transaction.findMany({
      where: { customerId },
      orderBy: { occurredAt: "desc" },
      take: OVERVIEW_LIMIT,
    }),
    prisma.transaction.groupBy({ by: ["type"], where: { customerId }, _sum: { amount: true } }),
  ]);

  const sumOf = (type: "INCOME" | "EXPENSE") => totals.find((t) => t.type === type)?._sum.amount ?? 0;
  return { plans, transactions, incomeKurus: sumOf("INCOME"), expenseKurus: sumOf("EXPENSE") };
}

/** Aktif müşterilerde kullanılan etiketler ve kaç müşteride geçtikleri (çoktan aza, sonra alfabetik). */
export async function listCustomerTags() {
  const rows = await prisma.customer.findMany({ where: { archivedAt: null }, select: { tags: true } });
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const tag of row.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "tr"));
}
