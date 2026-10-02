import { NextRequest, NextResponse } from "next/server";
import { requireRole, handleApiError } from "@/lib/api-auth";
import { removeTaskLink } from "@/lib/services/task-link-service";

/** Bağlantıyı kaldırır (arşivler). Yalnızca Admin ve Operasyon. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; linkId: string }> }) {
  try {
    await requireRole(["ADMIN", "OPERATIONS"]);
    const { id, linkId } = await params;
    return NextResponse.json(await removeTaskLink(id, linkId));
  } catch (error) {
    return handleApiError(error);
  }
}
