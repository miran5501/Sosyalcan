import { flushAuditQueue, prisma } from "@/lib/prisma";
import { DEFAULT_OPTIONS } from "@/lib/options";

/** Tüm tabloları boşaltır (migration tablosu hariç); her testten önce temiz başlangıç sağlar. */
export async function resetDb() {
  // Önceki testin arka planda yazılan denetim kayıtları bitmeden tablolar boşaltılmasın.
  await flushAuditQueue();
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  // Migration'ın eklediği başlangıç seçenekleri (Video/Drone/Diğer, Planlandı/...): her çekimin türü ve durumu olmalı.
  await prisma.optionItem.createMany({ data: DEFAULT_OPTIONS.map((o) => ({ ...o })) });
  // Başlangıç seçeneklerinin eklenmesi de denetim kaydına düşer; testler boş kayıtla başlasın.
  await flushAuditQueue();
  await prisma.auditLog.deleteMany();
}

/** Test çekimi için zorunlu seçenek alanları (başlangıç seçeneklerinden). */
export const shootDefaults = { typeId: "opt_type_video", deliveryStatusId: "opt_status_planned" } as const;

/** Test görevi için zorunlu durum (ilk Kanban sütunu "Bekliyor"). */
export const taskDefaults = { statusId: "opt_task_waiting" } as const;

export const makeCustomer = (name = "Test Müşteri") => prisma.customer.create({ data: { name } });

export const makePlan = (customerId: string, overrides: { title?: string; monthlyAmount?: number; billingDay?: number; archivedAt?: Date } = {}) =>
  prisma.paymentPlan.create({
    data: { customerId, title: "İçerik Paketi", monthlyAmount: 350_000, billingDay: 15, ...overrides },
  });

/** Yerel takvim gününü N gün öteler (saat 12:00), ay sonu/yıl sonu geçişlerini Date'e bırakır. */
export function daysFromToday(days: number) {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, 12, 0, 0);
}
