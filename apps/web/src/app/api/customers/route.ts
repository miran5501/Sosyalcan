import { NextRequest, NextResponse } from "next/server";
import { requireRole, requireSession, handleApiError } from "@/lib/api-auth";
import { createCustomerSchema, customerListQuerySchema } from "@/lib/validations/customer";
import { listCustomers, createCustomer } from "@/lib/services/customer-service";

export async function GET(request: NextRequest) {
  try {
    await requireSession(); // Finans/Viewer dahil tüm roller görüntüleyebilir
    const { searchParams } = new URL(request.url);
    const query = customerListQuerySchema.parse({
      search: searchParams.get("search") ?? undefined,
      tag: searchParams.get("tag") ?? undefined,
      includeArchived: searchParams.get("includeArchived") ?? undefined,
    });
    const customers = await listCustomers(query);
    return NextResponse.json(customers);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRole(["ADMIN", "OPERATIONS"]);
    const body = await request.json();
    const data = createCustomerSchema.parse(body);
    const customer = await createCustomer(data);
    return NextResponse.json(customer, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
