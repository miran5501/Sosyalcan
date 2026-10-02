import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, requestMeta, requireSession } from "@/lib/api-auth";
import {
  confirmSetup,
  disableTwoFactor,
  regenerateRecoveryCodes,
  sendManagementCode,
  startSetup,
  twoFactorStatus,
} from "@/lib/services/two-factor-service";

/**
 * Kişinin kendi iki adımlı doğrulaması (Hesabım sayfasındaki panel bu ucu kullanır).
 * GET: durum · POST { action: "setup" | "confirm" | "send-code" | "disable" | "recovery", method?, code?, password? }
 * method: "APP" (doğrulama uygulaması, varsayılan) | "EMAIL" (e-postaya gelen kod). "send-code": e-posta
 * yöntemindeki kişiye kapatma / kod yenileme öncesi kod gönderir.
 */
const method = z.enum(["APP", "EMAIL"]).default("APP");
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("setup"), method }),
  z.object({ action: z.literal("confirm"), method, code: z.string().trim().min(6).max(10) }),
  z.object({ action: z.literal("send-code") }),
  z.object({ action: z.literal("disable"), password: z.string().min(1, "Şifreni gir"), code: z.string().trim().min(6).max(20) }),
  z.object({ action: z.literal("recovery"), code: z.string().trim().min(6).max(20) }),
]);

export async function GET() {
  try {
    const session = await requireSession({ allowMustChangePassword: true });
    return NextResponse.json(await twoFactorStatus(session.user.id));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession({ allowMustChangePassword: true });
    const body = bodySchema.parse(await request.json());
    const { ip } = await requestMeta();
    switch (body.action) {
      case "setup":
        return NextResponse.json(await startSetup(session.user.id, body.method));
      case "confirm":
        return NextResponse.json(await confirmSetup(session.user.id, body.code, body.method));
      case "send-code":
        return NextResponse.json(await sendManagementCode(session.user.id));
      case "disable":
        await disableTwoFactor(session.user.id, body.password, body.code, ip);
        return NextResponse.json({ enabled: false });
      case "recovery":
        return NextResponse.json(await regenerateRecoveryCodes(session.user.id, body.code, ip));
    }
  } catch (error) {
    return handleApiError(error);
  }
}
