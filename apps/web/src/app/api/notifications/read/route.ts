import { NextRequest, NextResponse } from "next/server";
import { handleApiError, requireSession } from "@/lib/api-auth";
import { markRead, unreadCount } from "@/lib/services/notification-service";
import { markReadSchema } from "@/lib/validations/notification";

/** `{ ids: [...] }` ya da `{ all: true }`: yalnızca kişinin kendi bildirimleri okundu işaretlenir. */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const target = markReadSchema.parse(await request.json());
    const updated = await markRead(session.user.id, target);
    return NextResponse.json({ updated, unreadCount: await unreadCount(session.user.id) });
  } catch (error) {
    return handleApiError(error);
  }
}
