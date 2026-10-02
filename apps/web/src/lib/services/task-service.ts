import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { currentUserId } from "@/lib/api-auth";
import { notify } from "@/lib/services/notification-service";
import { ApiError } from "@/lib/api-error";
import { assertSelectable, firstActiveOption } from "@/lib/services/option-service";
import { childOptionSelect, orderByParent, resolvePublishTargets } from "@/lib/services/publish-targets";
import type { CreateTaskInput, UpdateTaskInput } from "@/lib/validations/task";

export const taskInclude = {
  customer: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true } },
  status: { select: { id: true, label: true, color: true, isDone: true, sortOrder: true, archivedAt: true } },
  publishTargets: childOptionSelect,
} satisfies Prisma.TaskInclude;

const ordered = <T extends { publishTargets: Parameters<typeof orderByParent>[0] }>(task: T): T => ({
  ...task,
  publishTargets: orderByParent(task.publishTargets),
});

/** Panoda "tamamlandı" sayılan sütunlardan varsayılan olarak gösterilen görev sayısı (en son güncellenenler). */
export const DONE_TASKS_LIMIT = 30;

/**
 * Pano (web ve mobil). Açık görevlerin hepsi; tamamlanan sütunlarda ise yalnızca son DONE_TASKS_LIMIT görev:
 * tamamlanan görevler yıllar içinde birikir ve panoyu yavaşlatır. `allDone: true` hepsini getirir.
 */
export async function listTasks(options: { allDone?: boolean } = {}) {
  const doneStatusIds = (await prisma.optionItem.findMany({ where: { kind: "TASK_STATUS", isDone: true }, select: { id: true } })).map((o) => o.id);
  const [open, done] = await Promise.all([
    prisma.task.findMany({ where: { archivedAt: null, statusId: { notIn: doneStatusIds } }, include: taskInclude, orderBy: { createdAt: "desc" } }),
    prisma.task.findMany({
      where: { archivedAt: null, statusId: { in: doneStatusIds } },
      include: taskInclude,
      orderBy: { updatedAt: "desc" },
      ...(options.allDone ? {} : { take: DONE_TASKS_LIMIT }),
    }),
  ]);
  return [...open, ...done].map(ordered);
}

/** Tamamlanan görevlerin toplamı (panoda "son 30 / toplam" bilgisi için). */
export async function countDoneTasks() {
  return prisma.task.count({ where: { archivedAt: null, status: { isDone: true } } });
}

export async function getTaskById(id: string) {
  const task = await prisma.task.findUnique({ where: { id }, include: taskInclude });
  if (!task) {
    throw new ApiError(404, "Görev bulunamadı");
  }
  return ordered(task);
}

/** Göreve yeni atanan kişiye bildirim (kendi kendine atadıysa gitmez). */
async function notifyTaskAssigned(task: { id: string; title: string; assigneeId: string | null; dueDate: Date | null; customer?: { name: string } | null }) {
  if (!task.assigneeId) return;
  const parts = [task.customer?.name, task.dueDate ? `teslim ${task.dueDate.toLocaleDateString("tr-TR", { day: "numeric", month: "long" })}` : null];
  await notify({
    type: "TASK_ASSIGNED",
    userIds: [task.assigneeId],
    exceptUserId: await currentUserId(),
    title: `Sana görev atandı: ${task.title}`,
    body: parts.filter(Boolean).join(" · ") || undefined,
    link: `/tasks/${task.id}/edit`,
  });
}

export async function createTask(input: CreateTaskInput) {
  // Yeni görev her zaman listenin ilk durumunda (ilk Kanban sütunu) başlar.
  const statusId = await firstActiveOption("TASK_STATUS");
  const targets = await resolvePublishTargets(input.publishTargetIds ?? []);
  const task = await prisma.task
    .create({
      data: {
        title: input.title,
        description: input.description,
        priority: input.priority,
        statusId,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        customerId: input.customerId || undefined,
        assigneeId: input.assigneeId || undefined,
        ...(targets.length > 0 ? { publishTargets: { connect: targets } } : {}),
      },
      include: taskInclude,
    })
    .then(ordered);
  await notifyTaskAssigned(task);
  return task;
}

export async function updateTask(id: string, input: UpdateTaskInput) {
  const current = await getTaskById(id);
  // Kaldırılmış bir seçenek, görevde zaten seçiliyse korunabilir.
  const statusId = input.statusId !== undefined ? await assertSelectable(input.statusId, ["TASK_STATUS"], [current.statusId]) : undefined;
  const targets =
    input.publishTargetIds !== undefined
      ? await resolvePublishTargets(input.publishTargetIds, current.publishTargets.map((t) => t.id))
      : undefined;

  const task = await prisma.task
    .update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(statusId !== undefined ? { statusId } : {}),
        ...(targets !== undefined ? { publishTargets: { set: targets } } : {}),
        ...(input.dueDate !== undefined ? { dueDate: input.dueDate ? new Date(input.dueDate) : null } : {}),
        ...(input.customerId !== undefined ? { customerId: input.customerId || null } : {}),
        ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId || null } : {}),
      },
      include: taskInclude,
    })
    .then(ordered);
  // Yalnızca atanan kişi DEĞİŞTİYSE bildirim (aynı kişiyle kaydetmek tekrar bildirim üretmez).
  if (task.assigneeId && task.assigneeId !== current.assigneeId) {
    await notifyTaskAssigned(task);
  }
  return task;
}

export async function updateTaskStatus(id: string, statusId: string) {
  const current = await getTaskById(id);
  await assertSelectable(statusId, ["TASK_STATUS"], [current.statusId]);
  return prisma.task.update({ where: { id }, data: { statusId }, include: taskInclude }).then(ordered);
}

export async function archiveTask(id: string) {
  await getTaskById(id);
  return prisma.task.update({ where: { id }, data: { archivedAt: new Date() } });
}
