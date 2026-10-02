import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { requireRole, requireSession, handleApiError } from "@/lib/api-auth";
import { FINANCE_VIEW_ROLES } from "@/lib/roles";
import { updateCustomerSchema } from "@/lib/validations/customer";
import { getCustomerById, updateCustomer, archiveCustomer } from "@/lib/services/customer-service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const session = await requireSession();
    const { id } = await params;
    // Ödeme planları finans verisidir: Operasyon rolüne dönmez.
    const includeFinance = FINANCE_VIEW_ROLES.includes(session.user.role as Role);
    const customer = await getCustomerById(id, { includeFinance });
    return NextResponse.json(customer);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    await requireRole(["ADMIN", "OPERATIONS"]);
    const { id } = await params;
    const body = await request.json();
    const data = updateCustomerSchema.parse(body);
    const customer = await updateCustomer(id, data);
    return NextResponse.json(customer);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    await requireRole(["ADMIN", "OPERATIONS"]);
    const { id } = await params;
    const customer = await archiveCustomer(id);
    return NextResponse.json(customer);
  } catch (error) {
    return handleApiError(error);
  }
}
