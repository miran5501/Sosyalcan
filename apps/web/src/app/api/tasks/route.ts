import { NextRequest, NextResponse } from "next/server";
import { requireRole, requireSession, handleApiError } from "@/lib/api-auth";
import { createTaskSchema } from "@/lib/validations/task";
import { listTasks, createTask } from "@/lib/services/task-service";

export async function GET() {
  try {
    await requireSession();
    const tasks = await listTasks();
    return NextResponse.json(tasks);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRole(["ADMIN", "OPERATIONS"]);
    const body = await request.json();
    const data = createTaskSchema.parse(body);
    const task = await createTask(data);
    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
