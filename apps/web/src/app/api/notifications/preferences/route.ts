import { NextRequest, NextResponse } from "next/server";
import { handleApiError, requireSession } from "@/lib/api-auth";
import type { NotificationType } from "@/lib/notification-types";
import { getPreferences, setPreferences } from "@/lib/services/notification-service";
import { preferencesSchema } from "@/lib/validations/notification";

/** Kişinin bildirim tercihleri (rolünün alabileceği türler; ödeme bildirimleri yalnızca Admin/Finans'ta). */
export async function GET() {
  try {
    const session = await requireSession();
    return NextResponse.json(await getPreferences(session.user.id, session.user.role));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await requireSession();
    const { preferences } = preferencesSchema.parse(await request.json());
    return NextResponse.json(
      await setPreferences(session.user.id, session.user.role, preferences as { type: NotificationType; inApp: boolean; email: boolean }[]),
    );
  } catch (error) {
    return handleApiError(error);
  }
}
