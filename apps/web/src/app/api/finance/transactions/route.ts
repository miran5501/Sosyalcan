import { NextRequest, NextResponse } from "next/server";
import { requireRole, handleApiError } from "@/lib/api-auth";
import { FINANCE_VIEW_ROLES, FINANCE_MANAGE_ROLES } from "@/lib/roles";
import { createTransactionSchema, transactionQuerySchema } from "@/lib/validations/finance";
import { listTransactions, createTransaction } from "@/lib/services/finance-service";

export async function GET(request: NextRequest) {
  try {
    await requireRole(FINANCE_VIEW_ROLES); // Operasyon buraya hic giremez
    const { searchParams } = new URL(request.url);
    const query = transactionQuerySchema.parse({
      year: searchParams.get("year") ?? undefined,
      month: searchParams.get("month") ?? undefined,
    });
    const transactions = await listTransactions(query);
    return NextResponse.json(transactions);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRole(FINANCE_MANAGE_ROLES);
    const body = await request.json();
    const data = createTransactionSchema.parse(body);
    const transaction = await createTransaction(data);
    return NextResponse.json(transaction, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
