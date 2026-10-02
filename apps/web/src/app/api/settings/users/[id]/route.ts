import { NextRequest, NextResponse } from "next/server";
import { requireRole, handleApiError } from "@/lib/api-auth";
import { ADMIN_ONLY } from "@/lib/roles";
import { updateUserSchema } from "@/lib/validations/settings";
import { updateUserByAdmin } from "@/lib/services/user-admin-service";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const session = await requireRole(ADMIN_ONLY);
    const { id } = await params;
    const data = updateUserSchema.parse(await request.json());
    const user = await updateUserByAdmin(session.user.id, id, data);
    return NextResponse.json(user);
  } catch (error) {
    return handleApiError(error);
  }
}
