"use server";

import { revalidatePath } from "next/cache";
import { ApiError, requireRole } from "@/lib/api-auth";
import { OPERATIONS_MANAGE_ROLES } from "@/lib/roles";
import { rescheduleCalendarItem, type MovableKind } from "@/lib/services/calendar-service";

/** Takvimde sürükle-bırak (Admin, Operasyon). Hata mesajı istemciye döner, sayfa çökmez. */
export async function moveCalendarItemAction(kind: MovableKind, id: string, dayKey: string): Promise<{ error?: string }> {
  try {
    await requireRole(OPERATIONS_MANAGE_ROLES);
    await rescheduleCalendarItem(kind, id, dayKey);
    revalidatePath("/calendar");
    return {};
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    throw error;
  }
}
