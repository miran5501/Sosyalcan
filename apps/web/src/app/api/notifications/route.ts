import { NextRequest, NextResponse, after } from "next/server";
import { handleApiError, requireSession } from "@/lib/api-auth";
import { ensureDailyRemindersRan, listNotifications } from "@/lib/services/notification-service";
import { listQuerySchema } from "@/lib/validations/notification";

/** Kişinin kendi bildirimleri (en yeni 50) + okunmamış sayısı. `?unread=1` yalnızca okunmamışlar. */
export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    const { unread } = listQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    // Günlük hatırlatmalar bugün çalışmadıysa yanıttan sonra arka planda çalışır (cron yoksa da).
    after(() => ensureDailyRemindersRan().catch((error) => console.error("[bildirim] günlük iş", error)));
    return NextResponse.json(await listNotifications(session.user.id, { unreadOnly: unread }));
  } catch (error) {
    return handleApiError(error);
  }
}
