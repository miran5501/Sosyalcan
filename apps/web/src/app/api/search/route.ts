import { NextRequest, NextResponse } from "next/server";
import { handleApiError, requireSession } from "@/lib/api-auth";
import type { Role } from "@prisma/client";
import { searchAll } from "@/lib/services/search-service";

/** Global arama: `GET /api/search?q=...` → `{ results }`. Tüm roller; finans sonuçları yalnızca finansı görebilenlere. */
export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    const q = new URL(request.url).searchParams.get("q") ?? "";
    return NextResponse.json({ results: await searchAll(q, session.user.role as Role) });
  } catch (error) {
    return handleApiError(error);
  }
}
