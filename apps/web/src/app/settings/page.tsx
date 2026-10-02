import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { auth } from "@/auth";
import { Nav } from "@/components/nav";
import { ApiError, requireRole } from "@/lib/api-auth";
import { ADMIN_ONLY } from "@/lib/roles";
import { ROLES, createUserSchema, updateUserSchema, partnersSchema } from "@/lib/validations/settings";
import { listAllUsers, createUserByAdmin, updateUserByAdmin } from "@/lib/services/user-admin-service";
import { listPartners, replacePartners } from "@/lib/services/revenue-share-service";
import { getAgencySettings, updateAgencySettings } from "@/lib/services/agency-service";
import { agencySettingsSchema } from "@/lib/validations/agency";
import { revokeAllSessions } from "@/lib/services/session-service";
import { clearTwoFactor } from "@/lib/services/two-factor-service";
import { anonymizeUser } from "@/lib/services/privacy-service";
import { formatDateTime } from "@/lib/labels";

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  OPERATIONS: "Operasyon",
  FINANCE: "Finans",
  VIEWER: "Viewer",
};

const EXTRA_PARTNER_ROWS = 2;

/** Servis/validasyon hatasını kullanıcıya gösterilecek mesaja çevirir; bilinmeyen hatalar yeniden fırlatılır. */
function toMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof ZodError) return error.issues[0]?.message ?? "Geçersiz veri";
  throw error;
}

async function runAction(action: () => Promise<void>) {
  let message: string | null = null;
  try {
    await action();
  } catch (error) {
    message = toMessage(error);
  }
  revalidatePath("/settings");
  if (message) {
    redirect(`/settings?error=${encodeURIComponent(message)}`);
  }
  redirect("/settings?ok=1");
}

async function createUserAction(formData: FormData) {
  "use server";
  await runAction(async () => {
    await requireRole(ADMIN_ONLY);
    const data = createUserSchema.parse({
      name: formData.get("name"),
      email: formData.get("email"),
      password: formData.get("password"),
      role: formData.get("role"),
    });
    await createUserByAdmin(data);
  });
}

async function updateRoleAction(formData: FormData) {
  "use server";
  await runAction(async () => {
    const session = await requireRole(ADMIN_ONLY);
    const data = updateUserSchema.parse({ role: formData.get("role") });
    await updateUserByAdmin(session.user.id, String(formData.get("id")), data);
  });
}

async function toggleDisabledAction(formData: FormData) {
  "use server";
  await runAction(async () => {
    const session = await requireRole(ADMIN_ONLY);
    const disabled = formData.get("disabled") === "true";
    await updateUserByAdmin(session.user.id, String(formData.get("id")), { disabled });
  });
}

async function resetPasswordAction(formData: FormData) {
  "use server";
  await runAction(async () => {
    const session = await requireRole(ADMIN_ONLY);
    const data = updateUserSchema.parse({ password: formData.get("password") });
    await updateUserByAdmin(session.user.id, String(formData.get("id")), data);
  });
}

async function revokeSessionsAction(formData: FormData) {
  "use server";
  await runAction(async () => {
    await requireRole(ADMIN_ONLY);
    await revokeAllSessions(String(formData.get("id")));
  });
}

async function resetTwoFactorAction(formData: FormData) {
  "use server";
  await runAction(async () => {
    await requireRole(ADMIN_ONLY);
    // Telefonunu kaybeden ve kurtarma kodu da kalmayan kişi için: 2FA kaldırılır, oturumları kapanır.
    const id = String(formData.get("id"));
    await clearTwoFactor(id);
    await revokeAllSessions(id);
  });
}

async function anonymizeUserAction(formData: FormData) {
  "use server";
  await runAction(async () => {
    const session = await requireRole(ADMIN_ONLY);
    await anonymizeUser(session.user.id, String(formData.get("id")));
  });
}

async function saveAgencyAction(formData: FormData) {
  "use server";
  await runAction(async () => {
    await requireRole(ADMIN_ONLY);
    const data = agencySettingsSchema.parse({
      name: formData.get("name"),
      logoUrl: formData.get("logoUrl") ?? "",
    });
    await updateAgencySettings(data);
  });
}

async function savePartnersAction(formData: FormData) {
  "use server";
  await runAction(async () => {
    await requireRole(ADMIN_ONLY);
    const rows: { name: string; sharePercent: number }[] = [];
    for (let i = 0; formData.has(`name_${i}`); i++) {
      const name = String(formData.get(`name_${i}`) ?? "").trim();
      const percent = String(formData.get(`percent_${i}`) ?? "").trim();
      if (!name && !percent) continue; // boş satır
      rows.push({ name, sharePercent: Number(percent) });
    }
    await replacePartners(partnersSchema.parse(rows));
  });
}

const inputClass =
  "mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const session = await auth();
  const user = session!.user;

  if (user.role !== "ADMIN") {
    redirect("/");
  }

  const { error, ok } = await searchParams;
  const [users, partners, agency] = await Promise.all([listAllUsers(), listPartners(), getAgencySettings()]);
  const partnerRows = [
    ...partners.map((p) => ({ name: p.name, percent: String(p.sharePercent) })),
    ...Array.from({ length: EXTRA_PARTNER_ROWS }, () => ({ name: "", percent: "" })),
  ];
  const totalPercent = partners.reduce((sum, p) => sum + p.sharePercent, 0);

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 lg:pl-64 print:pl-0">
      <Nav userName={user.name} userRole={user.role} />
      <main className="animate-fade-up mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">Ayarlar</h1>

        {error && (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        )}
        {ok && !error && (
          <p className="mt-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            Değişiklik kaydedildi.
          </p>
        )}

        <Link
          href="/settings/options"
          className="mt-6 flex items-center justify-between gap-4 rounded-2xl border border-neutral-200 bg-white shadow-sm p-5 hover:border-neutral-300 hover:bg-neutral-50"
        >
          <div>
            <p className="text-sm font-semibold text-neutral-900">Seçenek Listeleri</p>
            <p className="mt-0.5 text-sm text-neutral-500">
              Görev durumları (Kanban sütunları), çekim türleri ve teslim durumları, paylaşım platformları, ekipmanlar ve finans
              kategorileri.
            </p>
          </div>
          <span className="shrink-0 text-sm text-neutral-600">Yönet →</span>
        </Link>

        <Link
          href="/settings/system"
          className="mt-3 flex items-center justify-between gap-4 rounded-2xl border border-neutral-200 bg-white shadow-sm p-5 hover:border-neutral-300 hover:bg-neutral-50"
        >
          <div>
            <p className="text-sm font-semibold text-neutral-900">Sistem Durumu</p>
            <p className="mt-0.5 text-sm text-neutral-500">Veritabanı, Redis, sürüm, son yedek, günlük işler ve yakalanan hatalar.</p>
          </div>
          <span className="shrink-0 text-sm text-neutral-600">Görüntüle →</span>
        </Link>

        <Link
          href="/settings/privacy"
          className="mt-3 flex items-center justify-between gap-4 rounded-2xl border border-neutral-200 bg-white shadow-sm p-5 hover:border-neutral-300 hover:bg-neutral-50"
        >
          <div>
            <p className="text-sm font-semibold text-neutral-900">KVKK</p>
            <p className="mt-0.5 text-sm text-neutral-500">Aydınlatma metni, saklama süreleri ve silme talepleri.</p>
          </div>
          <span className="shrink-0 text-sm text-neutral-600">Düzenle →</span>
        </Link>

        <Link
          href="/settings/notifications"
          className="mt-3 flex items-center justify-between gap-4 rounded-2xl border border-neutral-200 bg-white shadow-sm p-5 hover:border-neutral-300 hover:bg-neutral-50"
        >
          <div>
            <p className="text-sm font-semibold text-neutral-900">Bildirimler ve E-posta</p>
            <p className="mt-0.5 text-sm text-neutral-500">
              Gönderim durumu, günlük hatırlatmalar ve giden kutusu.
            </p>
          </div>
          <span className="shrink-0 text-sm text-neutral-600">Görüntüle →</span>
        </Link>

        <Link
          href="/settings/audit"
          className="mt-3 flex items-center justify-between gap-4 rounded-2xl border border-neutral-200 bg-white shadow-sm p-5 hover:border-neutral-300 hover:bg-neutral-50"
        >
          <div>
            <p className="text-sm font-semibold text-neutral-900">Denetim Kaydı</p>
            <p className="mt-0.5 text-sm text-neutral-500">
              Girişler ve tüm kayıt değişiklikleri.
            </p>
          </div>
          <span className="shrink-0 text-sm text-neutral-600">Görüntüle →</span>
        </Link>

        <section className="mt-6">
          <h2 className="text-sm font-semibold text-neutral-900">Genel Ajans Bilgileri</h2>
          <form action={saveAgencyAction} className="mt-3 rounded-2xl border border-neutral-200 bg-white shadow-sm p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="agencyName" className="block text-sm font-medium text-neutral-700">
                  Ajans adı *
                </label>
                <input id="agencyName" name="name" required maxLength={60} defaultValue={agency.name} className={inputClass} />
              </div>
              <div>
                <label htmlFor="agencyLogo" className="block text-sm font-medium text-neutral-700">
                  Logo adresi (isteğe bağlı)
                </label>
                <input
                  id="agencyLogo"
                  name="logoUrl"
                  type="url"
                  placeholder="https://..."
                  defaultValue={agency.logoUrl ?? ""}
                  className={inputClass}
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-neutral-500">Ad ve logo üst menüde görünür. Logo dosya olarak yüklenmez; bir görsel adresi verilir.</p>
            <button
              type="submit"
              className="mt-4 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-on-brand hover:bg-brand-700"
            >
              Kaydet
            </button>
          </form>
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-semibold text-neutral-900">Kullanıcı Yönetimi</h2>

          <div className="mt-3 overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Ad</th>
                  <th className="px-4 py-3 font-medium">E-posta</th>
                  <th className="px-4 py-3 font-medium">Rol</th>
                  <th className="px-4 py-3 font-medium">Durum</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-neutral-100 transition-colors last:border-0 hover:bg-neutral-50">
                    <td className="px-4 py-3 font-medium text-neutral-900">
                      {u.name}
                      {u.id === user.id && <span className="ml-2 text-xs text-neutral-400">(sen)</span>}
                      {u.twoFactorEnabledAt && (
                        <span className="ml-2 rounded-full bg-green-50 px-1.5 py-0.5 text-[11px] font-medium text-green-700" title="İki adımlı doğrulama açık">
                          2FA
                        </span>
                      )}
                      <span className="block text-xs font-normal text-neutral-400">
                        {u.lastLoginAt ? `Son giriş: ${formatDateTime(u.lastLoginAt)}` : "Henüz giriş yapmadı"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-neutral-600">{u.email}</td>
                    <td className="px-4 py-3">
                      <form action={updateRoleAction} className="flex items-center gap-2">
                        <input type="hidden" name="id" value={u.id} />
                        <select
                          name="role"
                          defaultValue={u.role}
                          className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-900"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                        <button type="submit" className="text-xs text-neutral-600 hover:text-neutral-900 hover:underline">
                          Kaydet
                        </button>
                      </form>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          u.disabledAt ? "bg-neutral-100 text-neutral-500" : "bg-green-50 text-green-700"
                        }`}
                      >
                        {u.disabledAt ? "Devre dışı" : "Aktif"}
                      </span>
                    </td>
                    <td className="space-y-2 px-4 py-3 text-right">
                      <details className="group text-left">
                        <summary className="cursor-pointer list-none text-right text-sm text-neutral-600 hover:text-neutral-900">
                          Şifre / oturum
                        </summary>
                        <div className="mt-2 space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                          <form action={resetPasswordAction} className="flex gap-2">
                            <input type="hidden" name="id" value={u.id} />
                            <input
                              name="password"
                              type="password"
                              required
                              minLength={8}
                              maxLength={72}
                              autoComplete="new-password"
                              placeholder="Yeni şifre"
                              aria-label={`${u.name} için yeni şifre`}
                              className="w-full min-w-0 rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-900"
                            />
                            <button type="submit" className="shrink-0 text-xs text-neutral-700 hover:underline">
                              Sıfırla
                            </button>
                          </form>
                          {u.twoFactorEnabledAt && (
                            <form action={resetTwoFactorAction}>
                              <input type="hidden" name="id" value={u.id} />
                              <button type="submit" className="text-xs text-red-600 hover:underline">
                                2FA&apos;yı sıfırla (telefon kayboldu)
                              </button>
                            </form>
                          )}
                          {!u.anonymizedAt && u.id !== user.id && (
                            <form action={anonymizeUserAction}>
                              <input type="hidden" name="id" value={u.id} />
                              <button type="submit" className="text-xs text-red-600 hover:underline" title="Ad ve e-posta silinir, hesap kalıcı olarak kapanır">
                                KVKK: anonimleştir (geri alınamaz)
                              </button>
                            </form>
                          )}
                          <form action={revokeSessionsAction}>
                            <input type="hidden" name="id" value={u.id} />
                            <button type="submit" className="text-xs text-red-600 hover:underline">
                              Tüm oturumlarını kapat
                            </button>
                          </form>
                          <p className="text-[11px] leading-snug text-neutral-500">
                            Şifre sıfırlanınca kişinin web ve mobildeki açık oturumları da kapanır.
                          </p>
                        </div>
                      </details>
                      <form action={toggleDisabledAction}>
                        <input type="hidden" name="id" value={u.id} />
                        <input type="hidden" name="disabled" value={u.disabledAt ? "false" : "true"} />
                        <button
                          type="submit"
                          className={
                            u.disabledAt
                              ? "text-sm text-neutral-600 hover:text-neutral-900"
                              : "text-sm text-red-600 hover:text-red-800"
                          }
                        >
                          {u.disabledAt ? "Aktifleştir" : "Devre dışı bırak"}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form
            action={createUserAction}
            className="mt-4 grid grid-cols-1 gap-4 rounded-2xl border border-neutral-200 bg-white shadow-sm p-5 sm:grid-cols-2"
          >
            <p className="text-sm font-medium text-neutral-900 sm:col-span-2">Yeni Kullanıcı Ekle</p>
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-neutral-700">
                Ad Soyad *
              </label>
              <input id="name" name="name" required className={inputClass} />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-neutral-700">
                E-posta *
              </label>
              <input id="email" name="email" type="email" required className={inputClass} />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-neutral-700">
                Şifre * (en az 8 karakter, harf ve rakam)
              </label>
              <input id="password" name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className={inputClass} />
            </div>
            <div>
              <label htmlFor="role" className="block text-sm font-medium text-neutral-700">
                Rol
              </label>
              <select id="role" name="role" defaultValue="VIEWER" className={inputClass}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-on-brand hover:bg-brand-700"
              >
                Kullanıcı Oluştur
              </button>
            </div>
          </form>
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-semibold text-neutral-900">Gelir Dağıtım Oranları</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Aylık geliri ortaklar arasında paylaştırmak için kullanılır. Oranların toplamı %100 olmalı
            {partners.length > 0 && <> (şu an: %{totalPercent})</>}. Bir ortağı çıkarmak için satırı boş bırakın.
          </p>

          <form action={savePartnersAction} className="mt-3 space-y-3 rounded-2xl border border-neutral-200 bg-white shadow-sm p-5">
            {partnerRows.map((row, i) => (
              <div key={i} className="grid grid-cols-[1fr_7rem] gap-3">
                <input
                  name={`name_${i}`}
                  defaultValue={row.name}
                  placeholder="Ortak adı"
                  className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
                <div className="flex items-center gap-1">
                  <span className="text-sm text-neutral-500">%</span>
                  <input
                    name={`percent_${i}`}
                    type="number"
                    min={1}
                    max={100}
                    defaultValue={row.percent}
                    placeholder="0"
                    className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  />
                </div>
              </div>
            ))}
            <button
              type="submit"
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-on-brand hover:bg-brand-700"
            >
              Oranları Kaydet
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
