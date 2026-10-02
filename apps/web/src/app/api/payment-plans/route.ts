import { NextRequest, NextResponse } from "next/server";
import { requireRole, handleApiError } from "@/lib/api-auth";
import { FINANCE_VIEW_ROLES, FINANCE_MANAGE_ROLES } from "@/lib/roles";
import { createPaymentPlanSchema } from "@/lib/validations/finance";
import { listPaymentPlans, createPaymentPlan } from "@/lib/services/payment-plan-service";

export async function GET(request: NextRequest) {
  try {
    await requireRole(FINANCE_VIEW_ROLES);
    const { searchParams } = new URL(request.url);
    const includeArchived = searchParams.get("includeArchived") === "true";
    const plans = await listPaymentPlans(includeArchived);
    return NextResponse.json(plans);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRole(FINANCE_MANAGE_ROLES);
    const body = await request.json();
    const data = createPaymentPlanSchema.parse(body);
    const plan = await createPaymentPlan(data);
    return NextResponse.json(plan, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
