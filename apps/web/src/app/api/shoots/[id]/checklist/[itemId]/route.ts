import { NextRequest, NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/api-auth";
import { OPERATIONS_MANAGE_ROLES } from "@/lib/roles";
import { removeChecklistItem, setChecklistItemDone } from "@/lib/services/shoot-service";
import { checklistToggleSchema } from "@/lib/validations/shoot";

type Params = { params: Promise<{ id: string; itemId: string }> };

/** Maddeyi işaretler / işareti kaldırır (`{ done: boolean }`); mobildeki dokunuş da bunu kullanır. */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const session = await requireRole(OPERATIONS_MANAGE_ROLES);
    const { id, itemId } = await params;
    const { done } = checklistToggleSchema.parse(await request.json());
    return NextResponse.json(await setChecklistItemDone(id, itemId, done, session.user.id));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    await requireRole(OPERATIONS_MANAGE_ROLES);
    const { id, itemId } = await params;
    await removeChecklistItem(id, itemId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
