import Link from "next/link";
import { headers } from "next/headers";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AuthShell, Notice, authButtonClass, authInputClass } from "@/components/auth-shell";
import { clientIp } from "@/lib/rate-limit";
import { requestPasswordReset } from "@/lib/services/password-reset-service";

async function requestAction(formData: FormData) {
  "use server";
  const email = z.string().email().safeParse(String(formData.get("email") ?? "").trim());
  if (!email.success) redirect("/forgot-password?error=1");
  const ip = clientIp(await headers());
  // İş yanıttan sonra yapılır: yanıt süresinden e-postanın kayıtlı olup olmadığı anlaşılamasın.
  after(() => requestPasswordReset(email.data, ip).catch((error) => console.error("[şifre sıfırlama]", error)));
  redirect("/forgot-password?sent=1");
}

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const { sent, error } = await searchParams;
  return (
    <AuthShell title="Şifremi unuttum" subtitle="E-posta adresini gir; şifreni sıfırlaman için bir bağlantı gönderelim.">
      {sent ? (
        <div className="mt-6 space-y-4">
          <Notice tone="success">
            Bu adres sistemde kayıtlıysa şifre sıfırlama bağlantısı gönderildi. Bağlantı 30 dakika geçerli ve tek kullanımlık.
          </Notice>
          <p className="text-xs text-neutral-500">E-posta gelmediyse istenmeyen (spam) klasörüne bak ya da yöneticine başvur.</p>
          <Link href="/login" className="block text-center text-sm text-neutral-600 hover:text-neutral-900">
            ← Girişe dön
          </Link>
        </div>
      ) : (
        <form action={requestAction} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-neutral-700">
              E-posta
            </label>
            <input id="email" name="email" type="email" required autoComplete="email" className={authInputClass} />
          </div>
          {error && <Notice tone="error">Geçerli bir e-posta adresi gir.</Notice>}
          <button type="submit" className={authButtonClass}>
            Sıfırlama bağlantısı gönder
          </button>
          <Link href="/login" className="block text-center text-sm text-neutral-600 hover:text-neutral-900">
            ← Girişe dön
          </Link>
        </form>
      )}
    </AuthShell>
  );
}
