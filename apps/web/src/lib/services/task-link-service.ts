import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import type { CreateTaskLinkInput } from "@/lib/validations/task";

const authorSelect = { select: { id: true, name: true } } as const;

async function getTask(taskId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true, archivedAt: true } });
  if (!task) {
    throw new ApiError(404, "Görev bulunamadı");
  }
  return task;
}

/** Görevin (kaldırılmamış) bağlantıları, eskiden yeniye. */
export async function listTaskLinks(taskId: string) {
  await getTask(taskId);
  return prisma.taskLink.findMany({
    where: { taskId, archivedAt: null },
    include: { author: authorSelect },
    orderBy: { createdAt: "asc" },
  });
}

export async function addTaskLink(taskId: string, authorId: string, input: CreateTaskLinkInput) {
  const task = await getTask(taskId);
  if (task.archivedAt) {
    throw new ApiError(409, "Arşivlenmiş göreve bağlantı eklenemez");
  }
  return prisma.taskLink.create({
    data: { taskId, authorId, url: input.url, label: input.label ? input.label : null },
    include: { author: authorSelect },
  });
}

/** Bağlantıyı kaldırır: fiziksel silinmez, arşivlenir. */
export async function removeTaskLink(taskId: string, linkId: string) {
  const task = await getTask(taskId);
  if (task.archivedAt) {
    throw new ApiError(409, "Arşivlenmiş görevin bağlantıları değiştirilemez");
  }
  const link = await prisma.taskLink.findFirst({ where: { id: linkId, taskId, archivedAt: null }, select: { id: true } });
  if (!link) {
    throw new ApiError(404, "Bağlantı bulunamadı");
  }
  return prisma.taskLink.update({ where: { id: linkId }, data: { archivedAt: new Date() }, include: { author: authorSelect } });
}
