import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/services/notification-service";
import { ApiError } from "@/lib/api-error";
import type { CreateTaskCommentInput } from "@/lib/validations/task";

const authorSelect = { select: { id: true, name: true } } as const;

async function assertTaskExists(taskId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true, archivedAt: true } });
  // Arşivlenmiş görev yeni yorum almaz ama eski yorumları okunabilir kalır.
  if (!task) {
    throw new ApiError(404, "Görev bulunamadı");
  }
  return task;
}

/** Görevin yorumları, eskiden yeniye (konuşma sırasıyla). Yazarın yalnızca adı döner. */
export async function listTaskComments(taskId: string) {
  await assertTaskExists(taskId);
  return prisma.taskComment.findMany({
    where: { taskId },
    include: { author: authorSelect },
    orderBy: { createdAt: "asc" },
  });
}

export async function addTaskComment(taskId: string, authorId: string, input: CreateTaskCommentInput) {
  const task = await assertTaskExists(taskId);
  if (task.archivedAt) {
    throw new ApiError(409, "Arşivlenmiş göreve yorum eklenemez");
  }
  const comment = await prisma.taskComment.create({
    data: { taskId, authorId, body: input.body },
    include: { author: authorSelect },
  });
  const full = await prisma.task.findUnique({ where: { id: taskId }, select: { title: true, assigneeId: true } });
  await notify({
    type: "TASK_COMMENT",
    userIds: [full?.assigneeId],
    exceptUserId: authorId,
    title: `${comment.author.name} görevine yorum yazdı: ${full?.title ?? ""}`,
    body: input.body.length > 140 ? `${input.body.slice(0, 140)}…` : input.body,
    link: `/tasks/${taskId}/edit`,
  });
  return comment;
}
