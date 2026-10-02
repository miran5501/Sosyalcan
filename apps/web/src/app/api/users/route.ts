import { NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { listAssignableUsers } from "@/lib/services/user-service";

export async function GET() {
  try {
    await requireSession();
    const users = await listAssignableUsers();
    return NextResponse.json(users);
  } catch (error) {
    return handleApiError(error);
  }
}
