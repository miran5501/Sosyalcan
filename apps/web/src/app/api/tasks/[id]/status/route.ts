import { NextRequest, NextResponse } from "next/server";
import { requireRole, handleApiError } from "@/lib/api-auth";
import { updateTaskStatusSchema } from "@/lib/validations/task";
import { updateTaskStatus } from "@/lib/services/task-service";

/** Kanban sürükle-bırak için hafif uç: sadece durum değiştirir. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(["ADMIN", "OPERATIONS"]);
    const { id } = await params;
    const body = await request.json();
    const { statusId } = updateTaskStatusSchema.parse(body);
    const task = await updateTaskStatus(id, statusId);
    return NextResponse.json(task);
  } catch (error) {
    return handleApiError(error);
  }
}
