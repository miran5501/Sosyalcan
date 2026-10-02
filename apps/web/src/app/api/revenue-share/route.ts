import { NextRequest, NextResponse } from "next/server";
import { requireRole, handleApiError } from "@/lib/api-auth";
import { FINANCE_VIEW_ROLES } from "@/lib/roles";
import { revenueShareQuerySchema } from "@/lib/validations/settings";
import { calculateRevenueShare } from "@/lib/services/revenue-share-service";

export async function GET(request: NextRequest) {
  try {
    await requireRole(FINANCE_VIEW_ROLES);
    const { searchParams } = new URL(request.url);
    const query = revenueShareQuerySchema.parse({
      year: searchParams.get("year") ?? undefined,
      month: searchParams.get("month") ?? undefined,
      basis: searchParams.get("basis") ?? undefined,
    });
    const now = new Date();
    const result = await calculateRevenueShare(
      query.year ?? now.getFullYear(),
      query.month ?? now.getMonth() + 1,
      query.basis ?? "net",
    );
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
