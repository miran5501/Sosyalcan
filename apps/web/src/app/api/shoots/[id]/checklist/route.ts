import { NextRequest, NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/api-auth";
import { OPERATIONS_MANAGE_ROLES } from "@/lib/roles";
import { addChecklistItem } from "@/lib/services/shoot-service";
import { checklistItemSchema } from "@/lib/validations/shoot";

type Params = { params: Promise<{ id: string }> };

/** Çekime özel teslim kontrol maddesi ekler. */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    await requireRole(OPERATIONS_MANAGE_ROLES);
    const { id } = await params;
    const { label } = checklistItemSchema.parse(await request.json());
    return NextResponse.json(await addChecklistItem(id, label), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
