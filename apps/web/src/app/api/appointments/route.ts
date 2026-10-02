import { NextRequest, NextResponse } from "next/server";
import { requireRole, requireSession, handleApiError } from "@/lib/api-auth";
import { createAppointmentSchema } from "@/lib/validations/appointment";
import { listAppointments, createAppointment } from "@/lib/services/appointment-service";

export async function GET(request: NextRequest) {
  try {
    await requireSession();
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const appointments = await listAppointments({
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
    return NextResponse.json(appointments);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRole(["ADMIN", "OPERATIONS"]);
    const body = await request.json();
    const data = createAppointmentSchema.parse(body);
    const appointment = await createAppointment(data);
    return NextResponse.json(appointment, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
