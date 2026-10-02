import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getDashboard } from "@/lib/services/dashboard-service";

export async function GET() {
  try {
    const session = await requireSession();
    return NextResponse.json(await getDashboard(session.user.role as Role));
  } catch (error) {
    return handleApiError(error);
  }
}
