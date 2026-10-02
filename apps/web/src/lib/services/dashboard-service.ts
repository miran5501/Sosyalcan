import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FINANCE_VIEW_ROLES } from "@/lib/roles";
import { monthlySummary } from "@/lib/services/finance-service";

const UPCOMING_WINDOW_DAYS = 7;

function todayRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { start, end };
}

/** Bekleyen ödeme örneklerini vade gününe göre "geciken" ve "yaklaşan" olarak ayırır. */
async function paymentAlerts() {
  const { start } = todayRange();
  const windowEnd = new Date(start.getTime() + (UPCOMING_WINDOW_DAYS + 1) * 24 * 60 * 60 * 1000);

  const pending = await prisma.paymentInstance.findMany({
    where: { status: { not: "PAID" }, paymentPlan: { archivedAt: null } },
    include: { paymentPlan: { include: { customer: { select: { id: true, name: true } } } } },
  });

  const alerts = pending
    .map((i) => ({
      instanceId: i.id,
      planTitle: i.paymentPlan.title,
      customerName: i.paymentPlan.customer.name,
      amountKurus: i.amount,
      dueDate: new Date(i.year, i.month - 1, i.paymentPlan.billingDay),
      // Vade bir takvim günüdür, anlık değil: saat dilimi taşıyan ISO yerine "YYYY-MM-DD"
      // gönderilir ki farklı saat dilimindeki istemci (mobil) günü kaydırmasın.
      dueDateLabel: `${i.year}-${String(i.month).padStart(2, "0")}-${String(i.paymentPlan.billingDay).padStart(2, "0")}`,
    }))
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

  // `dueDate` (Date) burada `dueDateLabel` (YYYY-MM-DD metni) ile üzerine yazılır.
  const toAlert = ({ dueDateLabel, ...rest }: (typeof alerts)[number]) => ({ ...rest, dueDate: dueDateLabel });

  return {
    overdue: alerts.filter((a) => a.dueDate < start).map(toAlert),
    upcoming: alerts.filter((a) => a.dueDate >= start && a.dueDate < windowEnd).map(toAlert),
  };
}

/**
 * Ana ekran verisi. Finans bilgisi (aylık özet, ödeme uyarıları) yalnızca
 * finans görebilen rollere döner; Operasyon rolü bu alanı hiç almaz.
 */
export async function getDashboard(role: Role) {
  const { start, end } = todayRange();
  const now = new Date();
  const canSeeFinance = FINANCE_VIEW_ROLES.includes(role);

  const [activeCustomers, todayTasks, todayShoots, todayAppointments, finance] = await Promise.all([
    prisma.customer.count({ where: { archivedAt: null } }),
    prisma.task.findMany({
      where: { archivedAt: null, status: { isDone: false }, dueDate: { gte: start, lt: end } },
      include: { customer: { select: { name: true } }, assignee: { select: { name: true } } },
      orderBy: { priority: "desc" },
    }),
    prisma.shoot.findMany({
      where: { archivedAt: null, scheduledAt: { gte: start, lt: end } },
      include: {
        customer: { select: { name: true } },
        assignee: { select: { name: true } },
        type: { select: { id: true, label: true } },
        deliveryStatus: { select: { id: true, label: true, color: true, sortOrder: true } },
      },
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.appointment.findMany({
      where: { archivedAt: null, startsAt: { gte: start, lt: end } },
      include: { customer: { select: { name: true } } },
      orderBy: { startsAt: "asc" },
    }),
    canSeeFinance
      ? Promise.all([monthlySummary(now.getFullYear(), now.getMonth() + 1), paymentAlerts()])
      : Promise.resolve(null),
  ]);

  return {
    activeCustomers,
    todayTasks,
    todayShoots,
    todayAppointments,
    finance: finance
      ? { summary: finance[0], overduePayments: finance[1].overdue, upcomingPayments: finance[1].upcoming }
      : null,
  };
}
