import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthShell, Notice, authButtonClass, authInputClass } from "@/components/auth-shell";
import { clientIp } from "@/lib/rate-limit";
import { isResetTokenValid, resetPassword } from "@/lib/services/password-reset-service";
import { passwordSchema } from "@/lib/validations/auth";

async function resetAction(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const back = (message: string) => redirect(`/reset-password?token=${encodeURIComponent(token)}&error=${encodeURIComponent(message)}`);
  if (password !== formData.get("confirm")) back("Yeni şifre ile tekrarı eşleşmiyor");
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) back(parsed.error.issues[0]?.message ?? "Şifre geçersiz");
  const ok = await resetPassword(token, password, clientIp(await headers()));
  if (!ok) redirect("/reset-password?invalid=1");
  redirect("/login?reset=1");
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string; invalid?: string }>;
}) {
  const { token, error, invalid } = await searchParams;
  const valid = !invalid && (await isResetTokenValid(token));

  return (
    <AuthShell title="Yeni şifre belirle">
      {!valid ? (
        <div className="mt-6 space-y-4">
          <Notice tone="error">Bu bağlantı geçersiz, süresi dolmuş ya da daha önce kullanılmış.</Notice>
          <Link href="/forgot-password" className={`${authButtonClass} block text-center`}>
            Yeni bağlantı iste
          </Link>
        </div>
      ) : (
        <form action={resetAction} className="mt-6 space-y-4">
          <input type="hidden" name="token" value={token} />
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-neutral-700">
              Yeni şifre
            </label>
            <input id="password" name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className={authInputClass} />
          </div>
          <div>
            <label htmlFor="confirm" className="block text-sm font-medium text-neutral-700">
              Yeni şifre (tekrar)
            </label>
            <input id="confirm" name="confirm" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className={authInputClass} />
          </div>
          <p className="text-xs text-neutral-500">En az 8 karakter; en az bir harf ve bir rakam. Şifre değişince açık tüm oturumların kapanır.</p>
          {error && <Notice tone="error">{error}</Notice>}
          <button type="submit" className={authButtonClass}>
            Şifreyi kaydet
          </button>
        </form>
      )}
    </AuthShell>
  );
}
