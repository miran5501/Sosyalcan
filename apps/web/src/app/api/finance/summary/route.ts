import { NextRequest, NextResponse } from "next/server";
import { requireRole, handleApiError } from "@/lib/api-auth";
import { FINANCE_VIEW_ROLES } from "@/lib/roles";
import { monthlyExpenseByCategory, monthlySummary } from "@/lib/services/finance-service";

export async function GET(request: NextRequest) {
  try {
    await requireRole(FINANCE_VIEW_ROLES);
    const { searchParams } = new URL(request.url);
    const now = new Date();
    const year = Number(searchParams.get("year") ?? now.getFullYear());
    const month = Number(searchParams.get("month") ?? now.getMonth() + 1);
    const [summary, expenses] = await Promise.all([monthlySummary(year, month), monthlyExpenseByCategory(year, month)]);
    return NextResponse.json({ ...summary, expensesByCategory: expenses.categories });
  } catch (error) {
    return handleApiError(error);
  }
}
