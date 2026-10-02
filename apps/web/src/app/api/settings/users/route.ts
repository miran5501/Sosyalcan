import { NextRequest, NextResponse } from "next/server";
import { requireRole, handleApiError } from "@/lib/api-auth";
import { ADMIN_ONLY } from "@/lib/roles";
import { createUserSchema } from "@/lib/validations/settings";
import { listAllUsers, createUserByAdmin } from "@/lib/services/user-admin-service";

export async function GET() {
  try {
    await requireRole(ADMIN_ONLY);
    return NextResponse.json(await listAllUsers());
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRole(ADMIN_ONLY);
    const data = createUserSchema.parse(await request.json());
    const user = await createUserByAdmin(data);
    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
