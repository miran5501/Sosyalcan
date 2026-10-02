import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-auth";
import { audit } from "@/lib/audit";
import { refreshSchema } from "@/lib/validations/auth";
import { revokeRefreshToken } from "@/lib/services/session-service";
import { clientIp } from "@/lib/rate-limit";

/** Mobil çıkış: bu cihazın refresh token'ını (ve ailesini) iptal eder. Her durumda 204 döner. */
export async function POST(request: NextRequest) {
  try {
    const { refreshToken } = refreshSchema.parse(await request.json());
    const userId = await revokeRefreshToken(refreshToken);
    if (userId) {
      await audit({ action: "LOGOUT", userId, summary: "Mobil", ip: clientIp(request.headers) });
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
