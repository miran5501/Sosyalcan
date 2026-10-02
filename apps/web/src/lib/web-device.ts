import { cookies, headers } from "next/headers";
import { clientIp } from "@/lib/rate-limit";
import { DEVICE_COOKIE, DEVICE_COOKIE_MAX_AGE, hintsFromHeaders, newDeviceId, noteLoginDevice } from "@/lib/services/device-service";

/**
 * Web girişi tamamlanınca (server action içinde) çağrılır: tarayıcının cihaz çerezini okur, yoksa
 * oluşturur ve girişi "yeni cihaz" kontrolüne verir.
 */
export async function noteWebLogin(userId: string) {
  const jar = await cookies();
  let deviceId = jar.get(DEVICE_COOKIE)?.value;
  if (!deviceId) {
    deviceId = newDeviceId();
    jar.set(DEVICE_COOKIE, deviceId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: DEVICE_COOKIE_MAX_AGE,
    });
  }
  const h = await headers();
  await noteLoginDevice({ userId, deviceId, userAgent: h.get("user-agent"), ip: clientIp(h), channel: "Web", hints: hintsFromHeaders(h) });
}
