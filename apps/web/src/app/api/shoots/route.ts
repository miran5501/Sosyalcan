import { NextRequest, NextResponse } from "next/server";
import { requireRole, requireSession, handleApiError } from "@/lib/api-auth";
import { createShootSchema } from "@/lib/validations/shoot";
import { listShoots, createShoot } from "@/lib/services/shoot-service";

export async function GET(request: NextRequest) {
  try {
    await requireSession();
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const shoots = await listShoots({
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
    return NextResponse.json(shoots);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRole(["ADMIN", "OPERATIONS"]);
    const body = await request.json();
    const data = createShootSchema.parse(body);
    const shoot = await createShoot(data);
    return NextResponse.json(shoot, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
