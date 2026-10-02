import { NextRequest, NextResponse } from "next/server";
import { requireRole, handleApiError } from "@/lib/api-auth";
import { FINANCE_VIEW_ROLES, FINANCE_MANAGE_ROLES } from "@/lib/roles";
import { updatePaymentPlanSchema } from "@/lib/validations/finance";
import { getPaymentPlanById, updatePaymentPlan, archivePaymentPlan } from "@/lib/services/payment-plan-service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requireRole(FINANCE_VIEW_ROLES);
    const { id } = await params;
    const plan = await getPaymentPlanById(id);
    return NextResponse.json(plan);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    await requireRole(FINANCE_MANAGE_ROLES);
    const { id } = await params;
    const body = await request.json();
    const data = updatePaymentPlanSchema.parse(body);
    const plan = await updatePaymentPlan(id, data);
    return NextResponse.json(plan);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    await requireRole(FINANCE_MANAGE_ROLES);
    const { id } = await params;
    const plan = await archivePaymentPlan(id);
    return NextResponse.json(plan);
  } catch (error) {
    return handleApiError(error);
  }
}
