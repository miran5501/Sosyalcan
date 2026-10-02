import { NextRequest, NextResponse } from "next/server";
import { requireRole, requireSession, handleApiError } from "@/lib/api-auth";
import { createTaskLinkSchema } from "@/lib/validations/task";
import { addTaskLink, listTaskLinks } from "@/lib/services/task-link-service";

type Params = { params: Promise<{ id: string }> };

/** Görev bağlantılarını tüm roller okuyabilir. */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requireSession();
    const { id } = await params;
    return NextResponse.json(await listTaskLinks(id));
  } catch (error) {
    return handleApiError(error);
  }
}

/** Bağlantı eklemek bir değişikliktir: yalnızca Admin ve Operasyon. */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const session = await requireRole(["ADMIN", "OPERATIONS"]);
    const { id } = await params;
    const data = createTaskLinkSchema.parse(await request.json());
    return NextResponse.json(await addTaskLink(id, session.user.id, data), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
