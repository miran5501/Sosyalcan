import { prisma } from "@/lib/prisma";

/**
 * Müşteri aktivite geçmişi: müşterinin kendisine ve ona bağlı
 * kayıtlara (görev, görev yorumu/bağlantısı, çekim ve kontrol maddeleri, randevu; finansı
 * görebilen rollerde finans kaydı, ödeme planı ve ödemeleri) yapılan değişiklikler, en yeni üstte.
 *
 * Ayrı bir tablo tutulmaz: veriler denetim kaydından (audit_logs) okunur. Bu yüzden geçmiş,
 * denetim kaydının tutulmaya başladığı andan itibaren doludur.
 */
export async function getCustomerActivity(customerId: string, options: { includeFinance: boolean; limit?: number }) {
  const [tasks, shoots, appointments] = await Promise.all([
    prisma.task.findMany({ where: { customerId }, select: { id: true } }),
    prisma.shoot.findMany({ where: { customerId }, select: { id: true } }),
    prisma.appointment.findMany({ where: { customerId }, select: { id: true } }),
  ]);
  const taskIds = tasks.map((t) => t.id);
  const shootIds = shoots.map((s) => s.id);

  const [comments, links, checklist, finance] = await Promise.all([
    prisma.taskComment.findMany({ where: { taskId: { in: taskIds } }, select: { id: true } }),
    prisma.taskLink.findMany({ where: { taskId: { in: taskIds } }, select: { id: true } }),
    prisma.shootChecklistItem.findMany({ where: { shootId: { in: shootIds } }, select: { id: true } }),
    options.includeFinance
      ? Promise.all([
          prisma.transaction.findMany({ where: { customerId }, select: { id: true } }),
          prisma.paymentPlan.findMany({ where: { customerId }, select: { id: true, instances: { select: { id: true } } } }),
        ])
      : Promise.resolve(null),
  ]);

  const ids = [
    customerId,
    ...taskIds,
    ...shootIds,
    ...appointments.map((a) => a.id),
    ...comments.map((c) => c.id),
    ...links.map((l) => l.id),
    ...checklist.map((c) => c.id),
    ...(finance
      ? [...finance[0].map((t) => t.id), ...finance[1].flatMap((p) => [p.id, ...p.instances.map((i) => i.id)])]
      : []),
  ];

  return prisma.auditLog.findMany({
    where: { entityId: { in: ids }, action: { in: ["CREATE", "UPDATE", "DELETE"] } },
    orderBy: { createdAt: "desc" },
    take: options.limit ?? 30,
    select: { id: true, action: true, entity: true, summary: true, createdAt: true, user: { select: { name: true } } },
  });
}
