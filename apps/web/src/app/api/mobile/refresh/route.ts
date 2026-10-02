import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-auth";
import { refreshSchema } from "@/lib/validations/auth";
import { rotateRefreshToken } from "@/lib/services/session-service";
import { clientIp } from "@/lib/rate-limit";

/** Süresi dolan access token'ı yeniler. Refresh token tek kullanımlıktır; yenisi döner. */
export async function POST(request: NextRequest) {
  try {
    const { refreshToken } = refreshSchema.parse(await request.json());
    const result = await rotateRefreshToken(refreshToken, {
      ip: clientIp(request.headers),
      userAgent: request.headers.get("user-agent"),
    });
    if (!result) {
      return NextResponse.json({ error: "Oturumun süresi doldu, lütfen yeniden giriş yapın" }, { status: 401 });
    }
    return NextResponse.json({ ...result, token: result.accessToken });
  } catch (error) {
    return handleApiError(error);
  }
}
