import { NextRequest, NextResponse } from "next/server";
import { requireRole, handleApiError } from "@/lib/api-auth";
import { FINANCE_MANAGE_ROLES } from "@/lib/roles";
import { markPaymentInstancePaid } from "@/lib/services/payment-plan-service";

import { markPaidSchema } from "@/lib/validations/finance";

// Gövde isteğe bağlı: { paymentMethodId, invoiceNo } (yöntem admin'in ödeme yöntemleri listesinden).
const bodySchema = markPaidSchema.catch({});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(FINANCE_MANAGE_ROLES);
    const { id } = await params;
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const result = await markPaymentInstancePaid(id, body);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
