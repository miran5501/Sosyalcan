import { audit } from "@/lib/audit";
import { clientIp, loginLockMs, recordLoginFailure, resetLoginFailures } from "@/lib/rate-limit";
import { verifyCredentials } from "@/lib/services/user-service";
import { sendEmailCode } from "@/lib/services/two-factor-service";

/**
 * Girişin şifre adımı: web formu, Auth.js ve mobil giriş aynı kuralları kullanır.
 * Kilit (IP+e-posta ve hesap başına), şifre kontrolü, denetim kaydı. Hesapta 2FA açıksa
 * `twoFactor` yöntemi ("APP" | "EMAIL") döner ve oturum henüz açılmaz (ikinci adım beklenir);
 * e-posta yönteminde kod bu adımda gönderilir.
 */
export type PasswordStepResult =
  | { ok: false; lockedMs: number }
  | { ok: true; twoFactor: "APP" | "EMAIL" | null; user: NonNullable<Awaited<ReturnType<typeof verifyCredentials>>> };

export async function passwordLoginStep(email: string, password: string, headers: Headers, channel: "Web" | "Mobil"): Promise<PasswordStepResult> {
  const ip = clientIp(headers);
  const lockedMs = await loginLockMs(email, headers);
  if (lockedMs > 0) {
    await audit({ action: "LOGIN_LOCKED", summary: `${email} (${channel.toLowerCase()})`, ip });
    return { ok: false, lockedMs };
  }
  const user = await verifyCredentials(email, password);
  if (!user) {
    await recordLoginFailure(email, headers);
    await audit({ action: "LOGIN_FAILED", summary: `${email} (${channel.toLowerCase()})`, ip });
    return { ok: false, lockedMs: 0 };
  }
  await resetLoginFailures(email, headers);
  if (user.twoFactorMethod) {
    // Giriş henüz tamamlanmadı: başarı kaydı ikinci adımdan sonra yazılır.
    // Gönderim sınırına takılırsa daha önce gönderilen kod geçerli kalır; ekrandan yeniden istenebilir.
    if (user.twoFactorMethod === "EMAIL") await sendEmailCode(user.id, "login");
    return { ok: true, twoFactor: user.twoFactorMethod, user };
  }
  await audit({ action: "LOGIN_SUCCESS", userId: user.id, summary: channel, ip });
  return { ok: true, twoFactor: null, user };
}
