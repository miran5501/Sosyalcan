import { ApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { monthsInRange, paymentDueDate } from "@/lib/calendar";

export type PaymentDue = {
  key: string;
  dueDate: Date;
  planId: string;
  planTitle: string;
  customerName: string;
  amountKurus: number;
  /** PLANNED: örneği henüz oluşmamış, planın öngördüğü gelecek vade. */
  status: "PENDING" | "PAID" | "OVERDUE" | "PLANNED";
};

/**
 * Takvimde gösterilecek ödeme vadeleri ([start, end) aralığı). Yalnızca finans görebilen
 * roller için çağrılmalı. Kural: örneği (PaymentInstance) oluşmuş vadeler gerçek durumuyla,
 * örneği henüz oluşmamış GELECEKTEKİ vadeler "planlı" olarak gösterilir; geçmişte örneği hiç
 * oluşmamış vadeler gösterilmez (o dönem için ödeme beklenmiyordu). Arşivli planlar hariç.
 */
export async function listPaymentDues(start: Date, end: Date, now: Date = new Date()): Promise<PaymentDue[]> {
  const months = monthsInRange(start, end);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const plans = await prisma.paymentPlan.findMany({
    where: { archivedAt: null },
    include: {
      customer: { select: { name: true } },
      instances: { where: { OR: months.map((m) => ({ year: m.year, month: m.month })) } },
    },
  });

  const dues: PaymentDue[] = [];
  for (const plan of plans) {
    for (const m of months) {
      const dueDate = paymentDueDate(m.year, m.month, plan.billingDay);
      if (dueDate < start || dueDate >= end) continue;

      const base = { dueDate, planId: plan.id, planTitle: plan.title, customerName: plan.customer.name };
      const instance = plan.instances.find((i) => i.year === m.year && i.month === m.month);
      if (instance) {
        dues.push({ ...base, key: instance.id, amountKurus: instance.amount, status: instance.status });
      } else if (dueDate >= today) {
        dues.push({ ...base, key: `plan-${plan.id}-${m.year}-${m.month}`, amountKurus: plan.monthlyAmount, status: "PLANNED" });
      }
    }
  }
  return dues.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}

export type MovableKind = "task" | "shoot" | "appointment";

/**
 * Takvimde sürükle-bırak: kaydı başka bir güne taşır. Saatli kayıtlarda (çekim, randevu) saat aynı
 * kalır, yalnızca gün değişir. Görev son tarihi formdaki gibi UTC gece yarısı olarak saklanır.
 * Ödeme vadeleri ödeme planından hesaplandığı için taşınamaz. Arşivlenmiş kayıt taşınamaz.
 */
export async function rescheduleCalendarItem(kind: MovableKind, id: string, dayKey: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) throw new ApiError(400, "Geçersiz tarih");
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const onDay = (time: Date) => new Date(year, month - 1, day, time.getHours(), time.getMinutes(), time.getSeconds());

  if (kind === "task") {
    const task = await prisma.task.findFirst({ where: { id, archivedAt: null }, select: { id: true } });
    if (!task) throw new ApiError(404, "Görev bulunamadı");
    await prisma.task.update({ where: { id }, data: { dueDate: new Date(`${dayKey}T00:00:00.000Z`) } });
  } else if (kind === "shoot") {
    const shoot = await prisma.shoot.findFirst({ where: { id, archivedAt: null }, select: { scheduledAt: true } });
    if (!shoot) throw new ApiError(404, "Çekim bulunamadı");
    await prisma.shoot.update({ where: { id }, data: { scheduledAt: onDay(shoot.scheduledAt) } });
  } else if (kind === "appointment") {
    const appointment = await prisma.appointment.findFirst({ where: { id, archivedAt: null }, select: { startsAt: true } });
    if (!appointment) throw new ApiError(404, "Randevu bulunamadı");
    await prisma.appointment.update({ where: { id }, data: { startsAt: onDay(appointment.startsAt) } });
  } else {
    throw new ApiError(400, "Bu kayıt takvimde taşınamaz");
  }
}
