import { NextRequest, NextResponse } from "next/server";
import { requireRole, requireSession, handleApiError } from "@/lib/api-auth";
import { createTaskCommentSchema } from "@/lib/validations/task";
import { addTaskComment, listTaskComments } from "@/lib/services/task-comment-service";

type Params = { params: Promise<{ id: string }> };

/** Görev yorumlarını tüm roller okuyabilir. */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requireSession();
    const { id } = await params;
    return NextResponse.json(await listTaskComments(id));
  } catch (error) {
    return handleApiError(error);
  }
}

/** Yorum eklemek bir değişikliktir: yalnızca Admin ve Operasyon (Viewer hiçbir şey değiştiremez). */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const session = await requireRole(["ADMIN", "OPERATIONS"]);
    const { id } = await params;
    const data = createTaskCommentSchema.parse(await request.json());
    const comment = await addTaskComment(id, session.user.id, data);
    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
