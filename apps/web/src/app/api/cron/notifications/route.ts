import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-auth";
import { isCronAuthorized } from "@/lib/cron-auth";
import { ensureDailyRemindersRan } from "@/lib/services/notification-service";

/**
 * Günlük hatırlatmalar (vercel.json, her sabah). Bugün zaten çalıştıysa (ör. uygulama kullanılırken
 * arka planda) tekrar çalışmaz: `{ alreadyRan: true }`. Kullanıcı oturumu değil CRON_SECRET ister.
 */
export async function GET(request: NextRequest) {
  try {
    if (!isCronAuthorized(request)) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    }
    const result = await ensureDailyRemindersRan();
    return NextResponse.json(result ?? { alreadyRan: true });
  } catch (error) {
    return handleApiError(error);
  }
}
