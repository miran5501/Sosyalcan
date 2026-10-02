"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/api-auth";
import { updateTaskStatus, archiveTask } from "@/lib/services/task-service";

export async function updateTaskStatusAction(id: string, statusId: string) {
  await requireRole(["ADMIN", "OPERATIONS"]);
  await updateTaskStatus(id, statusId);
  revalidatePath("/tasks");
}

export async function archiveTaskAction(id: string) {
  await requireRole(["ADMIN", "OPERATIONS"]);
  await archiveTask(id);
  revalidatePath("/tasks");
}
