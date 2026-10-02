import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { PageShell } from "@/components/form-fields";
import { requireRole } from "@/lib/api-auth";
import { appUrl, emailMode, listOutbox, sendEmail } from "@/lib/email";
import { formatDateTime } from "@/lib/labels";
import { ADMIN_ONLY } from "@/lib/roles";
import { lastDailyRun, runDailyReminders } from "@/lib/services/notification-service";

const RESULT_LABELS: Record<string, string> = {
  taskDueSoon: "teslimi yaklaşan görev bildirimi",
  taskOverdue: "teslimi geçen görev bildirimi",
  shootTomorrow: "yarınki çekim bildirimi",
  paymentDueSoon: "vadesi yaklaşan ödeme bildirimi",
  paymentOverdue: "geciken ödeme bildirimi",
  digests: "günlük özet e-postası",
};

const STATUS_STYLES: Record<string, string> = {
  LOGGED: "bg-neutral-100 text-neutral-600",
  SENT: "bg-green-50 text-green-700",
  FAILED: "bg-red-50 text-red-700",
};
const STATUS_LABELS: Record<string, string> = { LOGGED: "Gönderilmedi (geliştirme)", SENT: "Gönderildi", FAILED: "Hata" };

/** Hatırlatmaları beklemeden çalıştırır (tekrar engelleme sayesinde aynı bildirim ikinci kez oluşmaz). */
async function runNowAction() {
  "use server";
  await requireRole(ADMIN_ONLY);
  const result = await runDailyReminders();
  revalidatePath("/settings/notifications");
  const total = Object.values(result).reduce((a, b) => a + b, 0);
  redirect(`/settings/notifications?ran=${total}`);
}

/** Admin'in kendi adresine deneme e-postası: SMTP ayarının çalıştığını görmek için. */
async function testEmailAction() {
  "use server";
  const session = await requireRole(ADMIN_ONLY);
  const result = await sendEmail({
    to: session.user.email!,
    subject: "SosyalCan deneme e-postası",
    text: `Bu bir deneme e-postasıdır. Bu e-postayı aldıysan e-posta gönderimi çalışıyor.

Uygulama adresi: ${appUrl("/")}`,
  });
  revalidatePath("/settings/notifications");
  redirect(`/settings/notifications?test=${result}`);
}

export default async function NotificationSettingsPage({ searchParams }: { searchParams: Promise<{ ran?: string; test?: string }> }) {
  const session = await auth();
  const user = session!.user;
  if (user.role !== "ADMIN") {
    redirect("/");
  }
  const { ran, test } = await searchParams;
  const [outbox, lastRun] = await Promise.all([listOutbox(50), lastDailyRun()]);
  const mode = emailMode();
  const lastResult = lastRun?.lastResult ? (JSON.parse(lastRun.lastResult) as Record<string, number>) : null;

  return (
    <PageShell user={user} title="Bildirimler ve E-posta" width="max-w-5xl">
      <Link href="/settings" className="mt-1 inline-block text-sm text-neutral-600 hover:text-neutral-900">
        ← Ayarlar
      </Link>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-neutral-900">E-posta gönderimi</h2>
          {mode === "dev" ? (
            <p className="mt-2 text-sm text-neutral-600">
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Geliştirme modu</span>
              <span className="mt-2 block">
                E-postalar gönderilmiyor, aşağıdaki giden kutusunda görünüyor. Açmak için sunucuya{" "}
                <code className="rounded bg-neutral-100 px-1">SMTP_URL</code> tanımlanmalı.
              </span>
            </p>
          ) : (
            <p className="mt-2 text-sm text-neutral-600">
              <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">SMTP açık</span>
              <span className="mt-2 block">E-postalar gönderiliyor. Şifre sıfırlama ve doğrulama kodlarının içeriği giden kutusunda saklanmaz.</span>
            </p>
          )}
          <form action={testEmailAction} className="mt-3">
            <button type="submit" className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50">
              Kendime deneme e-postası gönder
            </button>
          </form>
          {test === "SENT" && <p className="mt-2 text-sm text-green-700">Gönderildi. Gelen kutunu kontrol et.</p>}
          {test === "LOGGED" && <p className="mt-2 text-sm text-neutral-600">Giden kutusuna yazıldı (gönderim kurulu değil).</p>}
          {test === "FAILED" && <p className="mt-2 text-sm text-red-700">Gönderilemedi. Hata ayrıntısı giden kutusunda.</p>}
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-neutral-900">Günlük hatırlatmalar</h2>
          <p className="mt-2 text-sm text-neutral-600">
            Son çalışma: {lastRun ? formatDateTime(lastRun.lastRunAt) : "henüz çalışmadı"}
            {lastResult && (
              <span className="mt-1 block text-xs text-neutral-500">
                {Object.entries(lastResult)
                  .map(([k, v]) => `${v} ${RESULT_LABELS[k] ?? k}`)
                  .join(" · ")}
              </span>
            )}
          </p>
          <p className="mt-2 text-xs text-neutral-500">Her gün bir kez otomatik çalışır.</p>
          <form action={runNowAction} className="mt-3">
            <button type="submit" className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50">
              Şimdi çalıştır
            </button>
          </form>
          {ran !== undefined && <p className="mt-2 text-sm text-green-700">Çalıştırıldı: {ran} yeni bildirim / özet.</p>}
        </section>
      </div>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-neutral-900">Giden kutusu (son 50 e-posta)</h2>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-5 py-3 font-medium">Zaman</th>
                <th className="px-3 py-3 font-medium">Alıcı</th>
                <th className="px-3 py-3 font-medium">Konu / içerik</th>
                <th className="px-5 py-3 font-medium">Durum</th>
              </tr>
            </thead>
            <tbody>
              {outbox.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-neutral-500">
                    Henüz e-posta yok.
                  </td>
                </tr>
              )}
              {outbox.map((m) => (
                <tr key={m.id} className="border-b border-neutral-100 align-top last:border-0">
                  <td className="whitespace-nowrap px-5 py-3 text-neutral-600">{formatDateTime(m.createdAt)}</td>
                  <td className="px-3 py-3 text-neutral-700">{m.to}</td>
                  <td className="px-3 py-3">
                    <details>
                      <summary className="cursor-pointer text-neutral-900">{m.subject}</summary>
                      <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-neutral-50 p-3 font-sans text-xs text-neutral-700">{m.text}</pre>
                    </details>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[m.status] ?? ""}`} title={m.error ?? undefined}>
                      {STATUS_LABELS[m.status] ?? m.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </PageShell>
  );
}
