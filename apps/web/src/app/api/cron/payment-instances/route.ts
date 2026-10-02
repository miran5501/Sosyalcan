import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-auth";
import { isCronAuthorized } from "@/lib/cron-auth";
import { generateMonthlyInstances } from "@/lib/services/payment-plan-service";

/**
 * Günlük zamanlanmış görev (vercel.json): aktif ödeme planları için bu ayın ödeme
 * örneklerini üretir; böylece ana ekrandaki geciken/yaklaşan ödeme uyarıları elle
 * "Bu ay için oluştur" basılmasını beklemez. Kullanıcı oturumu değil CRON_SECRET ister.
 */
export async function GET(request: NextRequest) {
  try {
    if (!isCronAuthorized(request)) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    }
    return NextResponse.json(await generateMonthlyInstances());
  } catch (error) {
    return handleApiError(error);
  }
}
