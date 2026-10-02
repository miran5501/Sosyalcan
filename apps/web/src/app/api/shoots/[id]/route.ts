import { NextRequest, NextResponse } from "next/server";
import { requireRole, requireSession, handleApiError } from "@/lib/api-auth";
import { updateShootSchema, updateDeliveryStatusSchema } from "@/lib/validations/shoot";
import { getShootById, updateShoot, updateDeliveryStatus, archiveShoot } from "@/lib/services/shoot-service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requireSession();
    const { id } = await params;
    const shoot = await getShootById(id);
    return NextResponse.json(shoot);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    await requireRole(["ADMIN", "OPERATIONS"]);
    const { id } = await params;
    const body = await request.json();

    // Sadece teslim durumu gonderildiyse (mobildeki hizli guncelleme)
    if (Object.keys(body).length === 1 && "deliveryStatusId" in body) {
      const { deliveryStatusId } = updateDeliveryStatusSchema.parse(body);
      const shoot = await updateDeliveryStatus(id, deliveryStatusId);
      return NextResponse.json(shoot);
    }

    const data = updateShootSchema.parse(body);
    const shoot = await updateShoot(id, data);
    return NextResponse.json(shoot);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    await requireRole(["ADMIN", "OPERATIONS"]);
    const { id } = await params;
    const shoot = await archiveShoot(id);
    return NextResponse.json(shoot);
  } catch (error) {
    return handleApiError(error);
  }
}
