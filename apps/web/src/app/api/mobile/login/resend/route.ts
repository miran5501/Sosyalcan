import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api-auth";
import { verifyLoginToken } from "@/lib/login-token";
import { resendLoginCode } from "@/lib/services/two-factor-service";

const bodySchema = z.object({ challengeToken: z.string().min(20).max(2000) });

/** Mobil girişte e-posta kodunu yeniden gönderir (yalnızca e-postayla doğrulama kullanan hesaplar). */
export async function POST(request: NextRequest) {
  try {
    const { challengeToken } = bodySchema.parse(await request.json());
    const userId = await verifyLoginToken(challengeToken, "2fa-mobile");
    if (!userId) {
      return NextResponse.json({ error: "Doğrulama süresi doldu, yeniden giriş yapın" }, { status: 401 });
    }
    const result = await resendLoginCode(userId);
    if (result === "limited") {
      return NextResponse.json({ error: "Çok fazla kod istendi. Son gönderilen kodu kullanın ya da 15 dakika sonra deneyin." }, { status: 429 });
    }
    if (result === "not-email") {
      return NextResponse.json({ error: "Bu hesap e-postayla doğrulama kullanmıyor" }, { status: 400 });
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
