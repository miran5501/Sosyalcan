import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { auth, signOut } from "@/auth";
import { PageShell } from "@/components/form-fields";
import { ApiError, requireSession } from "@/lib/api-auth";
import { formatDateTime } from "@/lib/labels";
import { prisma } from "@/lib/prisma";
import { changeOwnPassword } from "@/lib/services/user-service";
import { listActiveMobileSessions, revokeAllSessions } from "@/lib/services/session-service";
import { changePasswordSchema } from "@/lib/validations/auth";
import { revalidatePath } from "next/cache";
import { NOTIFICATION_TYPE_KEYS, type NotificationType } from "@/lib/notification-types";
import { getPreferences, setPreferences } from "@/lib/services/notification-service";
import { emailMode } from "@/lib/email";
import { TwoFactorPanel } from "@/components/two-factor-panel";
import { twoFactorStatus } from "@/lib/services/two-factor-service";
import { displayIp, forgetDevice, listDevices } from "@/lib/services/device-service";

const ROLE_LABELS: Record<string, string> = { ADMIN: "Admin", OPERATIONS: "Operasyon", FINANCE: "Finans", VIEWER: "Viewer" };

const inputClass =
  "mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

async function changePasswordAction(formData: FormData) {
  "use server";
  let message: string | null = null;
  try {
    const session = await requireSession({ allowMustChangePassword: true });
    const data = changePasswordSchema.parse({
      currentPassword: formData.get("currentPassword"),
      newPassword: formData.get("newPassword"),
    });
    if (formData.get("newPassword") !== formData.get("confirmPassword")) {
      throw new ApiError(400, "Yeni şifre ile tekrarı eşleşmiyor");
    }
    await changeOwnPassword(session.user.id, data.currentPassword, data.newPassword);
  } catch (error) {
    if (error instanceof ApiError) message = error.message;
    else if (error instanceof ZodError) message = error.issues[0]?.message ?? "Geçersiz veri";
    else throw error;
  }
  if (message) {
    redirect(`/account?error=${encodeURIComponent(message)}`);
  }
  // Şifre değişince bu oturum da dahil hepsi geçersiz: çerezi temizleyip giriş sayfasına.
  await signOut({ redirectTo: "/login?changed=1" });
}

async function signOutEverywhereAction() {
  "use server";
  const session = await requireSession({ allowMustChangePassword: true });
  await revokeAllSessions(session.user.id);
  await signOut({ redirectTo: "/login" });
}

async function forgetDeviceAction(formData: FormData) {
  "use server";
  const session = await requireSession({ allowMustChangePassword: true });
  await forgetDevice(session.user.id, String(formData.get("deviceId") ?? "")).catch(() => undefined);
  revalidatePath("/account");
  redirect("/account#cihazlar");
}

/** Hesabım: kişinin kendi bilgileri, şifre değiştirme ve açık oturumlar (tüm roller). */
async function savePreferencesAction(formData: FormData) {
  "use server";
  const session = await requireSession({ allowMustChangePassword: true });
  // İşaretsiz kutu forma hiç gelmez: listedeki her tür için "var mı" diye bakılır.
  const prefs = NOTIFICATION_TYPE_KEYS.map((type: NotificationType) => ({
    type,
    inApp: formData.get(`inApp_${type}`) === "on",
    email: formData.get(`email_${type}`) === "on",
  }));
  await setPreferences(session.user.id, session.user.role, prefs);
  revalidatePath("/account");
  redirect("/account?saved=1#bildirimler");
}

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  const { error, saved } = await searchParams;
  const [preferences, twoFactor] = await Promise.all([
    getPreferences(session.user.id, session.user.role),
    twoFactorStatus(session.user.id),
  ]);
  const [me, mobileSessions, devices] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, email: true, role: true, lastLoginAt: true, passwordChangedAt: true, mustChangePassword: true },
    }),
    listActiveMobileSessions(session.user.id),
    listDevices(session.user.id),
  ]);
  if (!me) {
    redirect("/login");
  }

  return (
    <PageShell user={session.user} title="Hesabım" width="max-w-3xl">
      {me.mustChangePassword && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <p className="font-medium">Devam etmeden önce kendi şifreni belirlemelisin.</p>
          <p className="mt-0.5">
            Şu anki şifren yönetici tarafından verildi (ya da ilk kurulumdan geliyor). Aşağıdan yeni bir şifre belirleyince diğer
            sayfalar açılır.
          </p>
        </div>
      )}
      {error && <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-neutral-500">Ad</dt>
            <dd className="mt-0.5 font-medium text-neutral-900">{me.name}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-neutral-500">E-posta</dt>
            <dd className="mt-0.5 text-neutral-900">{me.email}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-neutral-500">Rol</dt>
            <dd className="mt-0.5 text-neutral-900">{ROLE_LABELS[me.role] ?? me.role}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-neutral-500">Son giriş</dt>
            <dd className="mt-0.5 text-neutral-900">{me.lastLoginAt ? formatDateTime(me.lastLoginAt) : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-neutral-500">Şifre son değişim</dt>
            <dd className="mt-0.5 text-neutral-900">{me.passwordChangedAt ? formatDateTime(me.passwordChangedAt) : "Hiç değiştirilmedi"}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-900">Şifre Değiştir</h2>
        <form action={changePasswordAction} className="mt-3 grid gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="currentPassword" className="block text-sm font-medium text-neutral-700">
              Mevcut şifre
            </label>
            <input id="currentPassword" name="currentPassword" type="password" required autoComplete="current-password" className={inputClass} />
          </div>
          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium text-neutral-700">
              Yeni şifre
            </label>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              required
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-neutral-700">
              Yeni şifre (tekrar)
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
              className={inputClass}
            />
          </div>
          <p className="text-xs text-neutral-500 sm:col-span-2">
            En az 8 karakter, harf ve rakam içermeli.
          </p>
          <div className="sm:col-span-2">
            <button type="submit" className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-on-brand hover:bg-brand-700">
              Şifreyi Değiştir
            </button>
          </div>
        </form>
      </section>

      <section className="mt-8" id="iki-adimli-dogrulama">
        <h2 className="text-sm font-semibold text-neutral-900">İki Adımlı Doğrulama (2FA)</h2>
        <TwoFactorPanel
          initial={{
            enabled: twoFactor.enabled,
            enabledAt: twoFactor.enabledAt ? twoFactor.enabledAt.toISOString() : null,
            recoveryCodesLeft: twoFactor.recoveryCodesLeft,
            method: twoFactor.method,
          }}
          email={twoFactor.email}
          emailAvailable={twoFactor.emailAvailable}
          emailDevMode={twoFactor.emailDevMode}
        />
      </section>

      <section className="mt-8" id="bildirimler">
        <h2 className="text-sm font-semibold text-neutral-900">Bildirim Tercihleri</h2>
        {saved && <p className="mt-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">Tercihlerin kaydedildi.</p>}
        <form action={savePreferencesAction} className="mt-3 overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-5 py-3 font-medium">Bildirim</th>
                <th className="px-3 py-3 text-center font-medium">Uygulamada</th>
                <th className="px-5 py-3 text-center font-medium">E-posta</th>
              </tr>
            </thead>
            <tbody>
              {preferences.map((p) => (
                <tr key={p.type} className="border-b border-neutral-100 last:border-0">
                  <td className="px-5 py-2.5 text-neutral-900">
                    {p.label}
                    <span className="block text-xs text-neutral-400">{p.delivery === "instant" ? "Olunca hemen" : "Günlük hatırlatma (e-postada günlük özet)"}</span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <input type="checkbox" name={`inApp_${p.type}`} defaultChecked={p.inApp} aria-label={`${p.label}: uygulamada`} className="h-4 w-4" />
                  </td>
                  <td className="px-5 py-2.5 text-center">
                    <input type="checkbox" name={`email_${p.type}`} defaultChecked={p.email} aria-label={`${p.label}: e-posta`} className="h-4 w-4" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 px-5 py-3">
            <p className="text-xs text-neutral-500">
              {emailMode() === "dev"
                ? "E-posta gönderimi henüz kurulu değil."
                : `E-postalar ${me.email} adresine gider.`}
            </p>
            <button type="submit" className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-on-brand hover:bg-brand-700">
              Tercihleri Kaydet
            </button>
          </div>
        </form>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-900">Oturumlar</h2>
        <div className="mt-3 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-neutral-600">Mobil uygulamada açık oturumlar:</p>
          {mobileSessions.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500">Açık mobil oturum yok.</p>
          ) : (
            <ul className="mt-3 divide-y divide-neutral-100 text-sm">
              {mobileSessions.map((s) => (
                <li key={s.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span className="text-neutral-800">{s.userAgent ? s.userAgent.slice(0, 60) : "Mobil uygulama"}</span>
                  <span className="text-neutral-500">
                    son etkinlik {formatDateTime(s.createdAt)}
                    {s.ip ? ` · ${s.ip}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <form action={signOutEverywhereAction} className="mt-4">
            <button type="submit" className="rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
              Tüm cihazlardan çıkış yap
            </button>
          </form>
        </div>
      </section>

      <section className="mt-8" id="cihazlar">
        <h2 className="text-sm font-semibold text-neutral-900">Giriş Yapılan Cihazlar</h2>
        <div className="mt-3 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          {devices.length === 0 ? (
            <p className="text-sm text-neutral-500">Henüz kayıtlı cihaz yok.</p>
          ) : (
            <ul className="-my-2 divide-y divide-neutral-100 text-sm">
              {devices.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="font-medium text-neutral-800">{d.label}</span>
                  <span className="flex items-center gap-3 text-neutral-500">
                    <span>
                      son giriş {formatDateTime(d.lastSeenAt)}
                      {displayIp(d.lastIp) ? ` · ${displayIp(d.lastIp)}` : ""}
                    </span>
                    <form action={forgetDeviceAction}>
                      <input type="hidden" name="deviceId" value={d.id} />
                      <button type="submit" className="text-xs text-neutral-500 underline hover:text-red-700">
                        Listeden çıkar
                      </button>
                    </form>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-900">Kişisel Verilerim (KVKK)</h2>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-neutral-600">
            Hesabınla ilgili kayıtların bir kopyası.{" "}
            <a href="/kvkk" className="text-brand-700 hover:underline">
              Aydınlatma metni
            </a>
          </p>
          <a href="/api/account/export" className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50">
            Verilerimi indir (JSON)
          </a>
        </div>
      </section>
    </PageShell>
  );
}
