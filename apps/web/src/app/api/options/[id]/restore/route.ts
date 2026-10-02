import { NextRequest, NextResponse } from "next/server";
import { requireRole, handleApiError } from "@/lib/api-auth";
import { ADMIN_ONLY } from "@/lib/roles";
import { restoreOption } from "@/lib/services/option-service";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    await requireRole(ADMIN_ONLY);
    const { id } = await params;
    return NextResponse.json(await restoreOption(id));
  } catch (error) {
    return handleApiError(error);
  }
}
