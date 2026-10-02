import { NextRequest, NextResponse } from "next/server";
import { requireRole, handleApiError } from "@/lib/api-auth";
import { restoreCustomer } from "@/lib/services/customer-service";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(["ADMIN", "OPERATIONS"]);
    const { id } = await params;
    const customer = await restoreCustomer(id);
    return NextResponse.json(customer);
  } catch (error) {
    return handleApiError(error);
  }
}
