import { NextRequest, NextResponse } from "next/server";
import { requireRole, handleApiError } from "@/lib/api-auth";
import { ADMIN_ONLY } from "@/lib/roles";
import { moveOption } from "@/lib/services/option-service";
import { moveOptionSchema } from "@/lib/validations/option";

type Params = { params: Promise<{ id: string }> };

/** Seçeneği listede bir yukarı/aşağı taşır: `{ "direction": "up" | "down" }`. */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    await requireRole(ADMIN_ONLY);
    const { id } = await params;
    const { direction } = moveOptionSchema.parse(await request.json());
    await moveOption(id, direction);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
