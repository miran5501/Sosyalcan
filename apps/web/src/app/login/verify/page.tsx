import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { AuthShell, Notice, authButtonClass, authInputClass } from "@/components/auth-shell";
import { audit } from "@/lib/audit";
import { signLoginToken, verifyLoginToken } from "@/lib/login-token";
import { prisma } from "@/lib/prisma";
import { clientIp } from "@/lib/rate-limit";
import { emailMode } from "@/lib/email";
import { noteWebLogin } from "@/lib/web-device";
import { maskEmail, resendLoginCode, verifySecondFactor } from "@/lib/services/two-factor-service";

const COOKIE = "sc_2fa";

async function verifyAction(formData: FormData) {
  "use server";
  const jar = await cookies();
  const userId = await verifyLoginToken(jar.get(COOKIE)?.value, "2fa-web");
  if (!userId) redirect("/login?expired=1");

  const ip = clientIp(await headers());
  const result = await verifySecondFactor(userId, String(formData.get("code") ?? ""), ip);
  if (!result.ok) redirect(`/login/verify?error=${result.locked ? "locked" : "1"}`);

  jar.delete({ name: COOKIE, path: "/login" });
  await audit({ action: "LOGIN_SUCCESS", userId, summary: result.usedRecovery ? "Web · 2FA (kurtarma kodu)" : "Web · 2FA", ip });
  await signIn("credentials", { loginToken: await signLoginToken(userId, "login", 60), redirect: false });
  await noteWebLogin(userId);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { mustChangePassword: true } });
  redirect(user?.mustChangePassword ? "/account" : "/");
}

async function resendAction() {
  "use server";
  const userId = await verifyLoginToken((await cookies()).get(COOKIE)?.value, "2fa-web");
  if (!userId) redirect("/login?expired=1");
  const result = await resendLoginCode(userId);
  redirect(`/login/verify?${result === "limited" ? "error=resend-limited" : "resent=1"}`);
}

/** Girişin ikinci adımı: doğrulama uygulamasındaki ya da e-postaya gelen 6 haneli kod, veya kurtarma kodu. */
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ error?: string; resent?: string }> }) {
  const pending = await verifyLoginToken((await cookies()).get(COOKIE)?.value, "2fa-web");
  if (!pending) redirect("/login?expired=1");
  const { error, resent } = await searchParams;
  const user = await prisma.user.findUnique({ where: { id: pending }, select: { email: true, twoFactorMethod: true } });
  const byEmail = user?.twoFactorMethod === "EMAIL";
  const subtitle = byEmail
    ? `${maskEmail(user?.email ?? "")} adresine gönderdiğimiz 6 haneli kodu gir.`
    : "Doğrulama uygulamandaki 6 haneli kodu gir.";

  return (
    <AuthShell title="İki adımlı doğrulama" subtitle={subtitle}>
      {byEmail && emailMode() === "dev" && (
        <div className="mt-4">
          <Notice tone="info">
            E-posta gönderimi kurulu değil; kod Admin&apos;in giden kutusunda görünür.
          </Notice>
        </div>
      )}
      <form action={verifyAction} className="mt-6 space-y-4">
        <div>
          <label htmlFor="code" className="block text-sm font-medium text-neutral-700">
            Doğrulama kodu
          </label>
          <input
            id="code"
            name="code"
            required
            autoFocus
            inputMode="text"
            autoComplete="one-time-code"
            maxLength={12}
            placeholder="123456"
            className={`${authInputClass} text-center font-mono text-lg tracking-widest`}
          />
          <p className="mt-1.5 text-xs text-neutral-500">
            {byEmail ? "E-postana ulaşamıyorsan" : "Telefonunu kaybettiysen"} kurtarma kodlarından birini (ör. ABCD-EFGH) girebilirsin.
          </p>
        </div>
        {error === "1" && <Notice tone="error">Kod hatalı. Yeni kodu bekleyip tekrar dene.</Notice>}
        {error === "locked" && <Notice tone="error">Çok fazla hatalı kod. 15 dakika sonra tekrar dene.</Notice>}
        {error === "resend-limited" && <Notice tone="error">Çok fazla kod istendi. Son gönderilen kodu kullan ya da 15 dakika sonra tekrar dene.</Notice>}
        {resent && <Notice tone="success">Yeni kod gönderildi. Önceki kod artık geçmez.</Notice>}
        <button type="submit" className={authButtonClass}>
          Doğrula ve giriş yap
        </button>
        {byEmail && (
          <button type="submit" formAction={resendAction} formNoValidate className="block w-full text-center text-sm text-brand-600 hover:text-brand-700">
            Kodu yeniden gönder
          </button>
        )}
        <Link href="/login" className="block text-center text-sm text-neutral-600 hover:text-neutral-900">
          ← Girişe dön
        </Link>
      </form>
    </AuthShell>
  );
}
