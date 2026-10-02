import type { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FINANCE_VIEW_ROLES } from "@/lib/roles";
import { formatDate, formatDateTime } from "@/lib/labels";

/**
 * Global arama (menüdeki arama kutusu, Ctrl+K): müşteri, görev, çekim, randevu; finansı görebilen
 * roller için ayrıca finans kayıtları ve ödeme planları. Arşivlenmiş kayıtlar gelmez.
 * Rol kuralı burada da geçerli: Operasyon finans sonucu hiçbir koşulda almaz.
 */
export type SearchGroup = "customers" | "tasks" | "shoots" | "appointments" | "transactions" | "paymentPlans";
export type SearchHit = { group: SearchGroup; id: string; title: string; subtitle?: string; href: string };

export const SEARCH_GROUP_LABELS: Record<SearchGroup, string> = {
  customers: "Müşteriler",
  tasks: "Görevler",
  shoots: "Çekimler",
  appointments: "Randevular",
  transactions: "Finans kayıtları",
  paymentPlans: "Ödeme planları",
};

const PER_GROUP = 5;
export const SEARCH_MIN_LENGTH = 2;

const contains = (q: string) => ({ contains: q, mode: "insensitive" as const });

export async function searchAll(rawQuery: string, role: Role): Promise<SearchHit[]> {
  const q = rawQuery.trim().slice(0, 100);
  if (q.length < SEARCH_MIN_LENGTH) return [];
  const customerMatch: Prisma.CustomerWhereInput = { name: contains(q) };
  const canSeeFinance = FINANCE_VIEW_ROLES.includes(role);

  const [customers, tasks, shoots, appointments, transactions, plans] = await Promise.all([
    prisma.customer.findMany({
      where: { archivedAt: null, OR: [{ name: contains(q) }, { contact: contains(q) }, { notes: contains(q) }, { tags: { has: q } }] },
      select: { id: true, name: true, contact: true },
      orderBy: { name: "asc" },
      take: PER_GROUP,
    }),
    prisma.task.findMany({
      where: { archivedAt: null, OR: [{ title: contains(q) }, { description: contains(q) }, { customer: customerMatch }] },
      select: { id: true, title: true, dueDate: true, customer: { select: { name: true } }, status: { select: { label: true } } },
      orderBy: { updatedAt: "desc" },
      take: PER_GROUP,
    }),
    prisma.shoot.findMany({
      where: { archivedAt: null, OR: [{ location: contains(q) }, { brief: contains(q) }, { customer: customerMatch }] },
      select: { id: true, scheduledAt: true, location: true, customer: { select: { name: true } }, type: { select: { label: true } } },
      orderBy: { scheduledAt: "desc" },
      take: PER_GROUP,
    }),
    prisma.appointment.findMany({
      where: { archivedAt: null, OR: [{ title: contains(q) }, { customer: customerMatch }] },
      select: { id: true, title: true, startsAt: true, customer: { select: { name: true } } },
      orderBy: { startsAt: "desc" },
      take: PER_GROUP,
    }),
    canSeeFinance
      ? prisma.transaction.findMany({
          where: {
            OR: [{ description: contains(q) }, { counterparty: contains(q) }, { invoiceNo: contains(q) }, { category: contains(q) }, { customer: customerMatch }],
          },
          select: { id: true, type: true, description: true, counterparty: true, category: true, occurredAt: true, customer: { select: { name: true } } },
          orderBy: { occurredAt: "desc" },
          take: PER_GROUP,
        })
      : Promise.resolve([]),
    canSeeFinance
      ? prisma.paymentPlan.findMany({
          where: { archivedAt: null, OR: [{ title: contains(q) }, { customer: customerMatch }] },
          select: { id: true, title: true, customer: { select: { name: true } } },
          orderBy: { title: "asc" },
          take: PER_GROUP,
        })
      : Promise.resolve([]),
  ]);

  const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(" · ") || undefined;
  return [
    ...customers.map((c) => ({ group: "customers" as const, id: c.id, title: c.name, subtitle: c.contact ?? undefined, href: `/customers/${c.id}` })),
    ...tasks.map((t) => ({
      group: "tasks" as const,
      id: t.id,
      title: t.title,
      subtitle: join(t.customer?.name, t.status.label, t.dueDate ? `teslim ${formatDate(t.dueDate)}` : null),
      href: `/tasks/${t.id}/edit`,
    })),
    ...shoots.map((s) => ({
      group: "shoots" as const,
      id: s.id,
      title: join(s.customer?.name, s.type.label) ?? "Çekim",
      subtitle: join(formatDateTime(s.scheduledAt), s.location),
      href: `/shoots/${s.id}/edit`,
    })),
    ...appointments.map((a) => ({
      group: "appointments" as const,
      id: a.id,
      title: a.title,
      subtitle: join(formatDateTime(a.startsAt), a.customer?.name),
      href: `/calendar/${a.id}/edit`,
    })),
    ...transactions.map((t) => ({
      group: "transactions" as const,
      id: t.id,
      title: t.description || t.counterparty || t.category || (t.type === "INCOME" ? "Gelir" : "Gider"),
      subtitle: join(t.type === "INCOME" ? "Gelir" : "Gider", formatDate(t.occurredAt), t.customer?.name ?? t.counterparty),
      href: `/finance/${t.id}`,
    })),
    ...plans.map((p) => ({ group: "paymentPlans" as const, id: p.id, title: p.title, subtitle: p.customer.name, href: `/payment-plans/${p.id}` })),
  ];
}
