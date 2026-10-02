import { NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";

/** Token hâlâ geçerli mi? Güncel kullanıcı bilgisini (rol dahil) döner; uygulama açılışında oturumu doğrulamak için. */
export async function GET() {
  try {
    const session = await requireSession({ allowMustChangePassword: true });
    return NextResponse.json(session.user);
  } catch (error) {
    return handleApiError(error);
  }
}
