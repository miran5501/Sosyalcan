import { NextRequest, NextResponse } from "next/server";
import { handleApiError, requireSession } from "@/lib/api-auth";
import { dismissNotification } from "@/lib/services/notification-service";

/** Bildirimi listeden kaldırır (yalnızca kendi bildirimi). Web ve mobildeki çarpı bu ucu kullanır. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    await dismissNotification(session.user.id, id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
