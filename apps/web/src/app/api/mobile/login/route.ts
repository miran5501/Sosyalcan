import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-auth";
import { loginSchema } from "@/lib/validations/auth";
import { issueTokenPair } from "@/lib/services/session-service";
import { passwordLoginStep } from "@/lib/services/login-service";
import { signLoginToken } from "@/lib/login-token";
import { clientIp, lockedMessage } from "@/lib/rate-limit";
import { noteLoginDevice } from "@/lib/services/device-service";

/**
 * Mobil giriş: e-posta/şifre doğrular; kısa ömürlü access token + refresh token ve kullanıcı özeti döner
 * (`token` alanı eski istemciler için access token'ın kopyası).
 * Hesapta iki adımlı doğrulama açıksa token yerine `{ twoFactorRequired, method, challengeToken }` döner
 * (method "EMAIL" ise kod e-postaya gönderilmiştir, "APP" ise doğrulama uygulamasındadır);
 * uygulama kodu `/api/mobile/login/verify`'a gönderir, e-posta kodunu `/api/mobile/login/resend` ile yeniden ister.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = loginSchema.parse(body);
    // Uygulamanın sakladığı cihaz kimliği ("yeni cihazdan giriş" uyarısı için; eski sürümler göndermez).
    const deviceId = typeof body?.deviceId === "string" ? body.deviceId.slice(0, 200) : null;
    const deviceName = typeof body?.deviceName === "string" ? body.deviceName.slice(0, 120) : null;
    const step = await passwordLoginStep(email, password, request.headers, "Mobil");
    if (!step.ok) {
      if (step.lockedMs > 0) {
        return NextResponse.json(
          { error: lockedMessage(step.lockedMs) },
          { status: 429, headers: { "Retry-After": String(Math.ceil(step.lockedMs / 1000)) } },
        );
      }
      // Hangi alanın yanlış olduğu (veya hesabın devre dışı olduğu) sızdırılmaz.
      return NextResponse.json({ error: "E-posta veya şifre hatalı" }, { status: 401 });
    }
    if (step.twoFactor) {
      return NextResponse.json({ twoFactorRequired: true, method: step.twoFactor, challengeToken: await signLoginToken(step.user.id, "2fa-mobile", 300) });
    }
    const { user } = step;
    const tokens = await issueTokenPair(user, { ip: clientIp(request.headers), userAgent: request.headers.get("user-agent") });
    await noteLoginDevice({ userId: user.id, deviceId, userAgent: request.headers.get("user-agent"), ip: clientIp(request.headers), channel: "Mobil", appDeviceName: deviceName });
    const publicUser = { id: user.id, name: user.name, email: user.email, role: user.role, mustChangePassword: user.mustChangePassword };
    return NextResponse.json({ ...tokens, token: tokens.accessToken, user: publicUser });
  } catch (error) {
    return handleApiError(error);
  }
}
