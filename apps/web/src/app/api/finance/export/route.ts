import { NextRequest, NextResponse } from "next/server";
import { requireRole, handleApiError } from "@/lib/api-auth";
import { transactionsToCsv } from "@/lib/finance-export";
import { FINANCE_VIEW_ROLES } from "@/lib/roles";
import { listTransactions } from "@/lib/services/finance-service";
import { transactionQuerySchema } from "@/lib/validations/finance";

/**
 * Finans kayıtlarını Excel'de açılacak CSV olarak indirir (`?year=2026&month=9`).
 * Yalnızca yıl verilirse o yılın tamamı, hiçbiri verilmezse bu ay. Operasyon rolü finans verisini göremez.
 */
export async function GET(request: NextRequest) {
  try {
    await requireRole(FINANCE_VIEW_ROLES);
    const { searchParams } = new URL(request.url);
    const query = transactionQuerySchema.parse({
      year: searchParams.get("year") ?? undefined,
      month: searchParams.get("month") ?? undefined,
    });

    const now = new Date();
    const year = query.year ?? now.getFullYear();
    const month = query.year === undefined && query.month === undefined ? now.getMonth() + 1 : query.month;

    const transactions = await listTransactions({ year, month });
    const period = month ? `${year}-${String(month).padStart(2, "0")}` : String(year);

    return new NextResponse(transactionsToCsv(transactions), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="finans-${period}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
