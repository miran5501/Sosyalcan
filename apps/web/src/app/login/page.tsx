import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { AuthShell, Notice, authButtonClass, authInputClass } from "@/components/auth-shell";
import { signLoginToken } from "@/lib/login-token";
import { passwordLoginStep } from "@/lib/services/login-service";
import { lockedMessage } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validations/auth";
import { noteWebLogin } from "@/lib/web-device";

const TWO_FACTOR_COOKIE = "sc_2fa";

async function authenticate(formData: FormData) {
  "use server";
  const parsed = loginSchema.safeParse({ email: String(formData.get("email") ?? "").trim().toLowerCase(), password: formData.get("password") });
  if (!parsed.success) redirect("/login?error=1");
  const { email, password } = parsed.data;

  const step = await passwordLoginStep(email, password, await headers(), "Web");
  if (!step.ok) {
    redirect(step.lockedMs > 0 ? `/login?locked=${Math.ceil(step.lockedMs / 60000)}` : "/login?error=1");
  }
  if (step.twoFactor) {
    // Şifre doğru; oturum kod adımından sonra açılır. Bekleyen giriş 5 dk geçerli, httpOnly çerezde.
    (await cookies()).set(TWO_FACTOR_COOKIE, await signLoginToken(step.user.id, "2fa-web", 300), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/login",
      maxAge: 300,
    });
    redirect("/login/verify");
  }
  await signIn("credentials", { loginToken: await signLoginToken(step.user.id, "login", 60), redirect: false });
  await noteWebLogin(step.user.id);
  // Geçici şifreyle giren kişi doğrudan Hesabım'a (şifresini belirlemeden başka yere geçemez).
  redirect(step.user.mustChangePassword ? "/account" : "/");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; changed?: string; locked?: string; reset?: string; expired?: string }>;
}) {
  const { error, changed, locked, reset, expired } = await searchParams;

  return (
    <AuthShell title="SosyalCan Komuta Merkezi" subtitle="Devam etmek için giriş yapın">
      <form action={authenticate} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-neutral-700">
            E-posta
          </label>
          <input id="email" name="email" type="email" required autoComplete="email" className={authInputClass} />
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="password" className="block text-sm font-medium text-neutral-700">
              Şifre
            </label>
            <Link href="/forgot-password" className="text-xs text-brand-700 hover:underline">
              Şifremi unuttum
            </Link>
          </div>
          <input id="password" name="password" type="password" required autoComplete="current-password" className={authInputClass} />
        </div>

        {error && <Notice tone="error">E-posta veya şifre hatalı. Art arda 5 hatalı denemeden sonra giriş 15 dakika kilitlenir.</Notice>}
        {locked && <Notice tone="error">{lockedMessage(Number(locked) * 60000)}</Notice>}
        {expired && <Notice tone="error">Doğrulama süresi doldu. Lütfen yeniden giriş yapın.</Notice>}
        {changed && !error && <Notice tone="success">Şifren değiştirildi ve tüm oturumların kapatıldı. Yeni şifrenle giriş yap.</Notice>}
        {reset && !error && <Notice tone="success">Şifren sıfırlandı. Yeni şifrenle giriş yapabilirsin.</Notice>}

        <button type="submit" className={authButtonClass}>
          Giriş Yap
        </button>
      </form>
    </AuthShell>
  );
}
