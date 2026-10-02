import { NextRequest, NextResponse } from "next/server";
import { requireRole, handleApiError } from "@/lib/api-auth";
import { FINANCE_MANAGE_ROLES } from "@/lib/roles";
import { ensureCurrentMonthInstance } from "@/lib/services/payment-plan-service";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(FINANCE_MANAGE_ROLES);
    const { id } = await params;
    const instance = await ensureCurrentMonthInstance(id);
    return NextResponse.json(instance, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
