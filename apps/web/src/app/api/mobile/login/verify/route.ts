import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api-auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { verifyLoginToken } from "@/lib/login-token";
import { clientIp } from "@/lib/rate-limit";
import { issueTokenPair } from "@/lib/services/session-service";
import { verifySecondFactor } from "@/lib/services/two-factor-service";
import { noteLoginDevice } from "@/lib/services/device-service";

const bodySchema = z.object({
  challengeToken: z.string().min(20).max(2000),
  code: z.string().trim().min(6, "Kodu girin").max(20),
  deviceId: z.string().max(200).optional(),
  deviceName: z.string().max(120).optional(),
});

/** Mobil girişin ikinci adımı: doğrulama uygulamasının kodu ya da kurtarma kodu → token'lar. */
export async function POST(request: NextRequest) {
  try {
    const { challengeToken, code, deviceId, deviceName } = bodySchema.parse(await request.json());
    const userId = await verifyLoginToken(challengeToken, "2fa-mobile");
    if (!userId) {
      return NextResponse.json({ error: "Doğrulama süresi doldu, yeniden giriş yapın" }, { status: 401 });
    }
    const ip = clientIp(request.headers);
    const result = await verifySecondFactor(userId, code, ip);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.locked ? "Çok fazla hatalı kod. 15 dakika sonra tekrar deneyin." : "Kod hatalı" },
        { status: result.locked ? 429 : 401 },
      );
    }
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const tokens = await issueTokenPair(user, { ip, userAgent: request.headers.get("user-agent") });
    await audit({ action: "LOGIN_SUCCESS", userId, summary: result.usedRecovery ? "Mobil · 2FA (kurtarma kodu)" : "Mobil · 2FA", ip });
    await noteLoginDevice({ userId, deviceId, userAgent: request.headers.get("user-agent"), ip, channel: "Mobil", appDeviceName: deviceName });
    const publicUser = { id: user.id, name: user.name, email: user.email, role: user.role, mustChangePassword: user.mustChangePassword };
    return NextResponse.json({ ...tokens, token: tokens.accessToken, user: publicUser });
  } catch (error) {
    return handleApiError(error);
  }
}
