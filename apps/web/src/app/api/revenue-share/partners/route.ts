import { NextRequest, NextResponse } from "next/server";
import { requireRole, handleApiError } from "@/lib/api-auth";
import { ADMIN_ONLY, FINANCE_VIEW_ROLES } from "@/lib/roles";
import { partnersSchema } from "@/lib/validations/settings";
import { listPartners, replacePartners } from "@/lib/services/revenue-share-service";

export async function GET() {
  try {
    await requireRole(FINANCE_VIEW_ROLES);
    return NextResponse.json(await listPartners());
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireRole(ADMIN_ONLY);
    const data = partnersSchema.parse(await request.json());
    return NextResponse.json(await replacePartners(data));
  } catch (error) {
    return handleApiError(error);
  }
}
