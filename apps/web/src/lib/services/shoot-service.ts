import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { type Page, pageArgs, toPage } from "@/lib/pagination";
import { currentUserId } from "@/lib/api-auth";
import { notify } from "@/lib/services/notification-service";
import { ApiError } from "@/lib/api-error";
import { assertSelectable, firstActiveOption } from "@/lib/services/option-service";
import { childOptionSelect, orderByParent, resolvePublishTargets } from "@/lib/services/publish-targets";
import type { CreateShootInput, UpdateShootInput } from "@/lib/validations/shoot";

/** Tür/durum/hedef/ekipman seçenekleri yalnızca görüntülemek için gereken alanlarla döner. */
export const shootInclude = {
  customer: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true } },
  type: { select: { id: true, label: true, archivedAt: true } },
  deliveryStatus: { select: { id: true, label: true, color: true, sortOrder: true, archivedAt: true } },
  publishTargets: childOptionSelect,
  equipmentItems: childOptionSelect,
  checklist: {
    select: { id: true, label: true, done: true, doneAt: true, doneBy: { select: { id: true, name: true } } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  },
} satisfies Prisma.ShootInclude;

/** Kontrol listesinin özeti (liste ve rozetler için): "3/4". */
export function checklistProgress(items: { done: boolean }[]) {
  return { done: items.filter((i) => i.done).length, total: items.length };
}

/** Paylaşım yerlerini platforma, ekipmanları kategoriye göre gruplu sıralar. */
export function withOrderedTargets<T extends { publishTargets: Parameters<typeof orderByParent>[0]; equipmentItems: Parameters<typeof orderByParent>[0] }>(
  shoot: T,
): T {
  return { ...shoot, publishTargets: orderByParent(shoot.publishTargets), equipmentItems: orderByParent(shoot.equipmentItems) };
}

export async function listShoots(params: { from?: Date; to?: Date } = {}) {
  return prisma.shoot
    .findMany({
      where: {
        archivedAt: null,
        ...(params.from || params.to
          ? {
              scheduledAt: {
                ...(params.from ? { gte: params.from } : {}),
                ...(params.to ? { lte: params.to } : {}),
              },
            }
          : {}),
      },
      include: shootInclude,
      orderBy: { scheduledAt: "asc" },
    })
    .then((shoots) => shoots.map(withOrderedTargets));
}

/**
 * Web listesi: "upcoming" bugünden itibaren (yakından uzağa), "past" geçmiş (yeniden eskiye), 25'er.
 * Geçmiş çekimler yıllar içinde biriktiği için tek seferde yüklenmez.
 */
export async function listShootsPage(params: { when: "upcoming" | "past"; page: number; now?: Date }): Promise<Page<Awaited<ReturnType<typeof listShoots>>[number]>> {
  const now = params.now ?? new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const where = { archivedAt: null, scheduledAt: params.when === "upcoming" ? { gte: today } : { lt: today } };
  const [items, total] = await Promise.all([
    prisma.shoot.findMany({
      where,
      include: shootInclude,
      orderBy: { scheduledAt: params.when === "upcoming" ? "asc" : "desc" },
      ...pageArgs(params.page),
    }),
    prisma.shoot.count({ where }),
  ]);
  return toPage(items.map(withOrderedTargets), total, params.page);
}

export async function getShootById(id: string) {
  const shoot = await prisma.shoot.findUnique({ where: { id }, include: shootInclude });
  if (!shoot) {
    throw new ApiError(404, "Çekim bulunamadı");
  }
  return withOrderedTargets(shoot);
}

/** Ekipmanları tekrarsız yapar ve her birinin ekipman listesinden olduğunu doğrular. */
async function resolveEquipment(ids: string[], keepIds: string[] = []) {
  const unique = [...new Set(ids.filter(Boolean))];
  for (const id of unique) {
    await assertSelectable(id, ["EQUIPMENT"], keepIds);
  }
  return unique.map((id) => ({ id }));
}

/** Çekime yeni atanan kişiye bildirim. */
async function notifyShootAssigned(shoot: { id: string; assigneeId: string | null; scheduledAt: Date; location: string | null; type: { label: string }; customer: { name: string } | null }) {
  if (!shoot.assigneeId) return;
  const when = shoot.scheduledAt.toLocaleString("tr-TR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  await notify({
    type: "SHOOT_ASSIGNED",
    userIds: [shoot.assigneeId],
    exceptUserId: await currentUserId(),
    title: `Sana çekim atandı: ${shoot.type.label} · ${when}`,
    body: [shoot.customer?.name, shoot.location].filter(Boolean).join(" · ") || undefined,
    link: `/shoots/${shoot.id}/edit`,
  });
}

export async function createShoot(input: CreateShootInput) {
  const typeId = input.typeId ? await assertSelectable(input.typeId, ["SHOOT_TYPE"]) : await firstActiveOption("SHOOT_TYPE");
  const deliveryStatusId = await firstActiveOption("DELIVERY_STATUS");
  const targets = await resolvePublishTargets(input.publishTargetIds ?? []);
  const equipment = await resolveEquipment(input.equipmentIds ?? []);
  // Teslim kontrol listesi admin'in şablonundan kopyalanır; sonradan şablon değişse de bu çekimin listesi korunur.
  const template = await prisma.optionItem.findMany({
    where: { kind: "DELIVERY_CHECKLIST", archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { label: true },
  });
  return prisma.shoot
    .create({
      data: {
        revisionCount: input.revisionCount ?? 0,
        ...(template.length > 0 ? { checklist: { create: template.map((t, i) => ({ label: t.label, sortOrder: i })) } } : {}),
        typeId,
        deliveryStatusId,
        scheduledAt: new Date(input.scheduledAt),
        location: input.location,
        brief: input.brief,
        equipment: input.equipment,
        deliveryLink: input.deliveryLink,
        customerId: input.customerId || undefined,
        assigneeId: input.assigneeId || undefined,
        ...(targets.length > 0 ? { publishTargets: { connect: targets } } : {}),
        ...(equipment.length > 0 ? { equipmentItems: { connect: equipment } } : {}),
      },
      include: shootInclude,
    })
    .then(withOrderedTargets)
    .then(async (shoot) => {
      await notifyShootAssigned(shoot);
      return shoot;
    });
}

export async function updateShoot(id: string, input: UpdateShootInput) {
  const current = await getShootById(id);
  // Kaldırılmış bir seçenek, çekimde zaten seçiliyse korunabilir.
  const typeId = input.typeId !== undefined ? await assertSelectable(input.typeId, ["SHOOT_TYPE"], [current.typeId]) : undefined;
  const deliveryStatusId =
    input.deliveryStatusId !== undefined
      ? await assertSelectable(input.deliveryStatusId, ["DELIVERY_STATUS"], [current.deliveryStatusId])
      : undefined;
  const targets =
    input.publishTargetIds !== undefined
      ? await resolvePublishTargets(input.publishTargetIds, current.publishTargets.map((t) => t.id))
      : undefined;
  const equipment =
    input.equipmentIds !== undefined ? await resolveEquipment(input.equipmentIds, current.equipmentItems.map((e) => e.id)) : undefined;

  return prisma.shoot
    .update({
      where: { id },
      data: {
        ...(typeId !== undefined ? { typeId } : {}),
        ...(deliveryStatusId !== undefined ? { deliveryStatusId } : {}),
        ...(targets !== undefined ? { publishTargets: { set: targets } } : {}),
        ...(equipment !== undefined ? { equipmentItems: { set: equipment } } : {}),
        ...(input.scheduledAt !== undefined ? { scheduledAt: new Date(input.scheduledAt) } : {}),
        ...(input.location !== undefined ? { location: input.location } : {}),
        ...(input.brief !== undefined ? { brief: input.brief } : {}),
        ...(input.equipment !== undefined ? { equipment: input.equipment } : {}),
        ...(input.deliveryLink !== undefined ? { deliveryLink: input.deliveryLink } : {}),
        ...(input.customerId !== undefined ? { customerId: input.customerId || null } : {}),
        ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId || null } : {}),
        ...(input.revisionCount !== undefined ? { revisionCount: input.revisionCount } : {}),
      },
      include: shootInclude,
    })
    .then(withOrderedTargets)
    .then(async (shoot) => {
      if (shoot.assigneeId && shoot.assigneeId !== current.assigneeId) await notifyShootAssigned(shoot);
      return shoot;
    });
}

/** Kontrol listesi değişiklikleri yalnızca arşivlenmemiş çekimde yapılabilir. */
async function editableShoot(id: string) {
  const shoot = await getShootById(id);
  if (shoot.archivedAt) {
    throw new ApiError(400, "Arşivlenmiş çekim değiştirilemez");
  }
  return shoot;
}

async function checklistItemOf(shootId: string, itemId: string) {
  const item = await prisma.shootChecklistItem.findFirst({ where: { id: itemId, shootId } });
  if (!item) {
    throw new ApiError(404, "Kontrol maddesi bulunamadı");
  }
  return item;
}

/** Maddeyi işaretler / işareti kaldırır; kimin ve ne zaman işaretlediği saklanır. */
export async function setChecklistItemDone(shootId: string, itemId: string, done: boolean, userId: string) {
  await editableShoot(shootId);
  await checklistItemOf(shootId, itemId);
  return prisma.shootChecklistItem.update({
    where: { id: itemId },
    data: done ? { done: true, doneAt: new Date(), doneById: userId } : { done: false, doneAt: null, doneById: null },
  });
}

/** Bu çekime özel madde ekler (listenin sonuna). */
export async function addChecklistItem(shootId: string, label: string) {
  await editableShoot(shootId);
  const last = await prisma.shootChecklistItem.findFirst({ where: { shootId }, orderBy: { sortOrder: "desc" } });
  return prisma.shootChecklistItem.create({ data: { shootId, label: label.trim(), sortOrder: (last?.sortOrder ?? -1) + 1 } });
}

/** Çekime özel listeden maddeyi kaldırır (madde çekime aittir, ayrı bir kayıt olarak saklanmaz). */
export async function removeChecklistItem(shootId: string, itemId: string) {
  await editableShoot(shootId);
  await checklistItemOf(shootId, itemId);
  await prisma.shootChecklistItem.delete({ where: { id: itemId } });
}

export async function updateDeliveryStatus(id: string, deliveryStatusId: string) {
  const current = await getShootById(id);
  await assertSelectable(deliveryStatusId, ["DELIVERY_STATUS"], [current.deliveryStatusId]);
  return prisma.shoot.update({ where: { id }, data: { deliveryStatusId }, include: shootInclude }).then(withOrderedTargets);
}

export async function archiveShoot(id: string) {
  await getShootById(id);
  return prisma.shoot.update({ where: { id }, data: { archivedAt: new Date() } });
}
