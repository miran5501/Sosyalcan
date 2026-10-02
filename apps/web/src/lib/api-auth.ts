import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { verifyMobileToken } from "@/lib/mobile-token";
import type { Role } from "@prisma/client";
import { ApiError } from "@/lib/api-error";
import { clientIp } from "@/lib/rate-limit";

export type AppSession = {
  user: { id: string; name?: string | null; email?: string | null; role: string; mustChangePassword?: boolean };
};

const MUST_CHANGE_MESSAGE = "Devam etmeden önce şifrenizi değiştirmeniz gerekiyor";

export { ApiError };

/**
 * Oturum yoksa 401 fırlatır. Her API route'ta ilk çağrılması gereken kontrol.
 * İki kimlik yolu desteklenir: web'in çerez oturumu (Auth.js) ve mobil
 * istemcinin `Authorization: Bearer` token'ı. İkisi de aynı şekle çevrilir,
 * böylece route'lar hangi istemciden geldiğini bilmek zorunda kalmaz.
 */
export async function requireSession(options: { allowMustChangePassword?: boolean } = {}): Promise<AppSession> {
  const authorization = (await headers()).get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    const claims = await verifyMobileToken(authorization.slice("Bearer ".length));
    const user = claims
      ? await prisma.user.findUnique({
          where: { id: claims.userId },
          select: { id: true, name: true, email: true, role: true, disabledAt: true, sessionVersion: true, mustChangePassword: true },
        })
      : null;
    // Şifre değişince sessionVersion artar: o ana kadar verilmiş token'lar reddedilir.
    if (!user || user.disabledAt || user.sessionVersion !== claims?.sessionVersion) {
      throw new ApiError(401, "Oturum bulunamadı");
    }
    if (user.mustChangePassword && !options.allowMustChangePassword) {
      throw new ApiError(403, MUST_CHANGE_MESSAGE);
    }
    return {
      user: { id: user.id, name: user.name, email: user.email, role: user.role, mustChangePassword: user.mustChangePassword },
    };
  }

  const session = await auth();
  if (!session?.user) {
    throw new ApiError(401, "Oturum bulunamadı");
  }
  // Sayfalar proxy'de Hesabım'a yönlenir; bu kontrol server action ve API için ikinci kilit.
  if (session.user.mustChangePassword && !options.allowMustChangePassword) {
    throw new ApiError(403, MUST_CHANGE_MESSAGE);
  }
  return session as AppSession;
}

/** O anki isteğin kullanıcısı; istek dışında (seed, test, cron) ya da oturum yoksa null. Hata fırlatmaz. */
export async function currentUserId(): Promise<string | null> {
  try {
    return (await requireSession({ allowMustChangePassword: true })).user.id;
  } catch {
    return null;
  }
}

/** Oturum + rol kontrolü. UI'da gizlemek yetmez, her mutasyon route'unda kullanılmalı. */
export async function requireRole(allowed: Role[]) {
  const session = await requireSession();
  if (!allowed.includes(session.user.role as Role)) {
    throw new ApiError(403, "Bu işlem için yetkiniz yok");
  }
  return session;
}

/** Denetim kaydı ve oturum kayıtları için istemci bilgisi. */
export async function requestMeta(): Promise<{ ip: string; userAgent: string | null }> {
  const h = await headers();
  return { ip: clientIp(h), userAgent: h.get("user-agent") };
}

export function handleApiError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    const { fieldErrors, formErrors } = error.flatten();
    // Alan bazlı hata yoksa (örn. "oranların toplamı %100 olmalı") form düzeyindeki mesajı göster.
    const noFieldErrors = Object.keys(fieldErrors).length === 0;
    return NextResponse.json(
      { error: noFieldErrors && formErrors.length > 0 ? formErrors[0] : "Geçersiz veri", details: fieldErrors },
      { status: 400 },
    );
  }
  console.error(error);
  return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
}
