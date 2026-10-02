import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { apiLimiter } from "@/lib/rate-limit";
import { isCrossSiteApiMutation, rateLimitKey } from "@/lib/request-guard";

// Next.js 16: "middleware" konvansiyonu "proxy" olarak yeniden adlandırıldı ve
// varsayılan olarak Node runtime'ında çalışır; bu yüzden edge-uyumlu ayrı
// yapılandırma yerine DB doğrulamalı tam `auth` kullanılır (devre dışı
// bırakılan kullanıcının oturumu burada düşer).
const authProxy = auth as unknown as (request: NextRequest, event: NextFetchEvent) => Promise<Response>;

/**
 * Her istekten önce: API için CSRF ve genel istek sınırı, ardından oturum kontrolü.
 * (/api/health izlemeden sık çağrılabildiği için sınırın dışında tutulur.)
 */
export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/") && pathname !== "/api/health") {
    if (isCrossSiteApiMutation(request)) {
      return NextResponse.json({ error: "İstek reddedildi (farklı kaynaktan gelen istek)" }, { status: 403 });
    }
    const limit = await apiLimiter.consume(rateLimitKey(request));
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Çok fazla istek gönderildi. Lütfen biraz bekleyip tekrar deneyin." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }
  }
  return authProxy(request, event);
}

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
