import { NextResponse } from "next/server";
import type { NextAuthConfig } from "next-auth";

/**
 * Edge (middleware) uyumlu ayarlar. Prisma/bcrypt gibi Node-only bağımlılık
 * içeren Credentials provider burada DEĞİL, auth.ts içinde tanımlanır —
 * middleware bu dosyayı kullanır, provider'ları değil.
 */
const PUBLIC_API = new Set([
  "/api/mobile/login",
  "/api/mobile/login/verify",
  "/api/mobile/login/resend",
  "/api/mobile/refresh",
  "/api/mobile/logout",
  "/api/health",
  "/api/client-errors",
]);
/** Oturumsuz açılabilen sayfalar: şifre sıfırlama ve KVKK aydınlatma metni. */
const PUBLIC_PAGES = ["/forgot-password", "/reset-password", "/kvkk"];

/** Şifresini değiştirmesi gereken kişinin girebileceği yerler (geri kalan her şey Hesabım'a yönlenir). */
const MUST_CHANGE_ALLOWED = ["/account", "/api/account/password", "/api/mobile/me"];

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    // Kayan süre: 12 saat hiç kullanılmayan oturum düşer; kullanıldıkça (en çok saatte bir) uzar.
    maxAge: 12 * 60 * 60,
    updateAge: 60 * 60,
  },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;
      const isOnLogin = pathname.startsWith("/login");
      const isApiRoute = pathname.startsWith("/api/");

      // Oturumsuz erişilebilen uçlar: giriş, mobil token yenileme/çıkış, sağlık kontrolü.
      if (isOnLogin || PUBLIC_API.has(pathname) || PUBLIC_PAGES.includes(pathname)) {
        return true;
      }
      if (isLoggedIn) {
        // Admin'in verdiği geçici şifreyle giren kişi önce kendi şifresini belirlemeli.
        if (auth.user.mustChangePassword && !MUST_CHANGE_ALLOWED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
          if (isApiRoute) {
            return NextResponse.json({ error: "Devam etmeden önce şifrenizi değiştirmeniz gerekiyor" }, { status: 403 });
          }
          return NextResponse.redirect(new URL("/account", request.nextUrl));
        }
        return true;
      }
      // Mobil istemci çerez değil Bearer token gönderir; token'ın kendisi
      // (imza, süre, hesabın aktif olması) route içinde requireSession ile doğrulanır.
      if (isApiRoute && request.headers.get("authorization")?.startsWith("Bearer ")) {
        return true;
      }
      // API route'lar (mobil istemci dahil) icin HTML login sayfasina
      // yonlendirme yerine JSON 401 donulmeli.
      if (isApiRoute) {
        return NextResponse.json({ error: "Oturum bulunamadı" }, { status: 401 });
      }
      return false;
    },
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.role = token.role as string;
        session.user.mustChangePassword = token.mcp === true;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
