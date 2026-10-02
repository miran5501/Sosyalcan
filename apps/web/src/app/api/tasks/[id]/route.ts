import { NextRequest, NextResponse } from "next/server";
import { requireRole, requireSession, handleApiError } from "@/lib/api-auth";
import { updateTaskSchema } from "@/lib/validations/task";
import { getTaskById, updateTask, archiveTask } from "@/lib/services/task-service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requireSession();
    const { id } = await params;
    const task = await getTaskById(id);
    return NextResponse.json(task);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    await requireRole(["ADMIN", "OPERATIONS"]);
    const { id } = await params;
    const body = await request.json();
    const data = updateTaskSchema.parse(body);
    const task = await updateTask(id, data);
    return NextResponse.json(task);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    await requireRole(["ADMIN", "OPERATIONS"]);
    const { id } = await params;
    const task = await archiveTask(id);
    return NextResponse.json(task);
  } catch (error) {
    return handleApiError(error);
  }
}
