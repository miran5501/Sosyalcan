import { NextRequest, NextResponse } from "next/server";
import { requireRole, requireSession, handleApiError } from "@/lib/api-auth";
import { updateAppointmentSchema } from "@/lib/validations/appointment";
import { getAppointmentById, updateAppointment, archiveAppointment } from "@/lib/services/appointment-service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requireSession();
    const { id } = await params;
    const appointment = await getAppointmentById(id);
    return NextResponse.json(appointment);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    await requireRole(["ADMIN", "OPERATIONS"]);
    const { id } = await params;
    const body = await request.json();
    const data = updateAppointmentSchema.parse(body);
    const appointment = await updateAppointment(id, data);
    return NextResponse.json(appointment);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    await requireRole(["ADMIN", "OPERATIONS"]);
    const { id } = await params;
    const appointment = await archiveAppointment(id);
    return NextResponse.json(appointment);
  } catch (error) {
    return handleApiError(error);
  }
}
