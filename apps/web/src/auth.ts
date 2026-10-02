import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@/auth.config";
import { loginSchema } from "@/lib/validations/auth";
import { prisma } from "@/lib/prisma";
import { passwordLoginStep } from "@/lib/services/login-service";
import { verifyLoginToken } from "@/lib/login-token";
import { clientIp } from "@/lib/rate-limit";
import { hintsFromHeaders, noteLoginDevice } from "@/lib/services/device-service";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    /**
     * JWT oturumları kendi başına iptal edilemez. Her istekte kullanıcıyı
     * veritabanından doğrulayarak (a) devre dışı bırakılan kullanıcının
     * oturumunu düşürüyor, (b) rol değişikliğini yeniden giriş beklemeden
     * yansıtıyoruz. null dönmek oturumu geçersiz kılar.
     */
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.sv = user.sessionVersion ?? 0;
        token.mcp = user.mustChangePassword ?? false;
        return token;
      }
      if (!token.sub) {
        return null;
      }
      const current = await prisma.user.findUnique({
        where: { id: token.sub },
        select: { role: true, disabledAt: true, sessionVersion: true, mustChangePassword: true },
      });
      // Şifre değişince / tüm oturumlar kapatılınca sessionVersion artar ve eski çerez geçersiz olur.
      if (!current || current.disabledAt || current.sessionVersion !== (token.sv ?? 0)) {
        return null;
      }
      token.role = current.role;
      token.mcp = current.mustChangePassword;
      return token;
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
        loginToken: {},
      },
      authorize: async (credentials, request) => {
        // 1) Giriş formu / 2FA adımı: şifre (ve gerekiyorsa kod) zaten doğrulandı; sunucu içi 60 sn'lik belirteç.
        if (typeof credentials?.loginToken === "string" && credentials.loginToken) {
          const userId = await verifyLoginToken(credentials.loginToken, "login");
          const user = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null;
          if (!user || user.disabledAt) return null;
          return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            sessionVersion: user.sessionVersion,
            mustChangePassword: user.mustChangePassword,
          };
        }
        // 2) Doğrudan e-posta/şifre (Auth.js uç noktası). 2FA açık hesap bu yoldan giremez: kod adımı atlanamasın.
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }
        const step = await passwordLoginStep(parsed.data.email, parsed.data.password, request.headers, "Web");
        if (!step.ok || step.twoFactor) {
          return null;
        }
        // Bu yoldan girişte de "yeni cihaz" kontrolü atlanmasın (çerez varsa onunla, yoksa tarayıcı bilgisiyle).
        const deviceCookie = /(?:^|;\s*)sc_device=([^;]+)/.exec(request.headers.get("cookie") ?? "")?.[1];
        await noteLoginDevice({ userId: step.user.id, deviceId: deviceCookie, userAgent: request.headers.get("user-agent"), ip: clientIp(request.headers), channel: "Web", hints: hintsFromHeaders(request.headers) });
        return step.user;
      },
    }),
  ],
});
