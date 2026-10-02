import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { PageShell } from "@/components/form-fields";
import { requireRole } from "@/lib/api-auth";
import { ADMIN_ONLY } from "@/lib/roles";
import { getPrivacySettings, runRetentionCleanup, savePrivacySettings } from "@/lib/services/privacy-service";

const days = (min: number) => z.coerce.number().int().min(min, `En az ${min} gün olmalı`).max(3650, "En fazla 3650 gün (10 yıl)");
const schema = z.object({
  notice: z.string().trim().min(50, "Metin çok kısa").max(30_000, "Metin çok uzun"),
  auditRetentionDays: days(30),
  notificationRetentionDays: days(7),
  emailRetentionDays: days(7),
  errorRetentionDays: days(7),
});

async function saveAction(formData: FormData) {
  "use server";
  await requireRole(ADMIN_ONLY);
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/settings/privacy?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Geçersiz değer")}`);
  await savePrivacySettings(parsed.data);
  revalidatePath("/settings/privacy");
  revalidatePath("/kvkk");
  redirect("/settings/privacy?ok=1");
}

async function cleanupAction() {
  "use server";
  await requireRole(ADMIN_ONLY);
  const result = await runRetentionCleanup();
  const total = Object.values(result).reduce((a, b) => a + b, 0);
  redirect(`/settings/privacy?cleaned=${total}`);
}

const input =
  "mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

export default async function PrivacySettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; cleaned?: string }> }) {
  const session = await auth();
  const user = session!.user;
  if (user.role !== "ADMIN") redirect("/");
  const { ok, error, cleaned } = await searchParams;
  const { notice, isTemplate, retention } = await getPrivacySettings();

  const retentionFields: { name: keyof typeof retention; label: string; hint: string }[] = [
    { name: "auditRetentionDays", label: "Denetim kaydı", hint: "Kim, ne zaman, neyi değiştirdi (IP dahil)" },
    { name: "notificationRetentionDays", label: "Bildirimler", hint: "Uygulama içi bildirimler" },
    { name: "emailRetentionDays", label: "Giden e-postalar", hint: "Giden kutusu kayıtları" },
    { name: "errorRetentionDays", label: "Hata kayıtları", hint: "Sistem Durumu'ndaki hatalar" },
  ];

  return (
    <PageShell user={user} title="KVKK" width="max-w-4xl">
      <Link href="/settings" className="mt-1 inline-block text-sm text-neutral-600 hover:text-neutral-900">
        ← Ayarlar
      </Link>
      {error && <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {ok && <p className="mt-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">Kaydedildi.</p>}
      {cleaned !== undefined && (
        <p className="mt-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">Temizlik çalıştı: {cleaned} kayıt silindi.</p>
      )}

      <form action={saveAction} className="mt-5 space-y-6">
        <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-neutral-900">Aydınlatma metni</h2>
            <Link href="/kvkk" target="_blank" className="text-sm text-brand-700 hover:underline">
              Herkese açık sayfayı gör →
            </Link>
          </div>
          {isTemplate && (
            <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
              Şu an taslak şablon gösteriliyor. [Köşeli parantez] içindeki yerleri ajans bilgileriyle doldurup kaydedin; yayından önce bir
              hukukçuya kontrol ettirin.
            </p>
          )}
          <p className="mt-2 text-xs text-neutral-500">
            Biçim: &quot;## &quot; ile başlayan satır başlık, &quot;- &quot; ile başlayan satır madde, boş satır paragraf arası. Giriş sayfasındaki
            &quot;KVKK Aydınlatma Metni&quot; bağlantısında gösterilir.
          </p>
          <textarea name="notice" rows={22} defaultValue={notice} className={`${input} font-mono text-xs leading-relaxed`} aria-label="Aydınlatma metni" />
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-neutral-900">Saklama süreleri (gün)</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Süresi dolan kayıtlar her gün otomatik silinir. Finans ve iş kayıtları bu kapsamda değildir.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {retentionFields.map((f) => (
              <label key={f.name} className="block text-sm font-medium text-neutral-700">
                {f.label}
                <input name={f.name} type="number" min={7} max={3650} defaultValue={retention[f.name]} className={input} />
                <span className="mt-1 block text-xs font-normal text-neutral-500">{f.hint}</span>
              </label>
            ))}
          </div>
        </section>

        <button type="submit" className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-on-brand hover:bg-brand-700">
          Kaydet
        </button>
      </form>

      <section className="mt-8 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-neutral-900">Haklar ve talepler</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-600">
          <li>Kullanıcılar kendi verilerinin kopyasını Hesabım → &quot;Verilerimi indir&quot; ile alır.</li>
          <li>Müşterinin silme talebi: müşteri sayfasındaki &quot;KVKK: kişisel bilgileri sil&quot; (finans kayıtları anonim olarak kalır).</li>
          <li>Ayrılan çalışanın silme talebi: Ayarlar → Kullanıcılar → &quot;Şifre / oturum&quot; → &quot;KVKK: anonimleştir&quot;.</li>
        </ul>
        <form action={cleanupAction} className="mt-4">
          <button type="submit" className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50">
            Saklama temizliğini şimdi çalıştır
          </button>
        </form>
      </section>
    </PageShell>
  );
}
