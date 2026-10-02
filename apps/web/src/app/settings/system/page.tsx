import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { PageShell } from "@/components/form-fields";
import { requireRole } from "@/lib/api-auth";
import { listErrors, resolveError } from "@/lib/error-tracking";
import { formatDateTime } from "@/lib/labels";
import { ADMIN_ONLY } from "@/lib/roles";
import { getSystemStatus } from "@/lib/services/system-status-service";

async function resolveAction(formData: FormData) {
  "use server";
  await requireRole(ADMIN_ONLY);
  await resolveError(String(formData.get("id")));
  revalidatePath("/settings/system");
}

const SOURCE_LABELS: Record<string, string> = { server: "Sunucu", web: "Tarayıcı", mobile: "Mobil" };

function Status({ ok, label }: { ok: boolean | null; label: string }) {
  const style = ok === null ? "bg-neutral-100 text-neutral-600" : ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>{label}</span>;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500">{title}</h2>
      <div className="mt-2 text-sm text-neutral-800">{children}</div>
    </section>
  );
}

const uptime = (s: number) => (s < 3600 ? `${Math.round(s / 60)} dk` : s < 86400 ? `${Math.round(s / 3600)} saat` : `${Math.round(s / 86400)} gün`);

export default async function SystemStatusPage() {
  const session = await auth();
  const user = session!.user;
  if (user.role !== "ADMIN") redirect("/");
  const [status, errors] = await Promise.all([getSystemStatus(), listErrors(50)]);

  return (
    <PageShell user={user} title="Sistem Durumu" width="max-w-5xl">
      <Link href="/settings" className="mt-1 inline-block text-sm text-neutral-600 hover:text-neutral-900">
        ← Ayarlar
      </Link>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card title="Veritabanı">
          <Status ok={status.database === "ok"} label={status.database === "ok" ? "Çalışıyor" : "Erişilemiyor"} />
          <p className="mt-2 text-xs text-neutral-500">
            Yanıt {status.dbLatencyMs} ms{status.dbSize ? ` · boyut ${status.dbSize}` : ""}
          </p>
        </Card>
        <Card title="Redis (sayaçlar ve önbellek)">
          <Status
            ok={status.redis === "disabled" ? null : status.redis === "ok"}
            label={status.redis === "ok" ? "Çalışıyor" : status.redis === "disabled" ? "Tanımlı değil (bellek kullanılıyor)" : "Erişilemiyor (bellek kullanılıyor)"}
          />
        </Card>
        <Card title="E-posta">
          <Status ok={status.emailMode === "smtp" ? true : null} label={status.emailMode === "smtp" ? "SMTP açık" : "Geliştirme modu"} />
          <p className="mt-2 text-xs">
            <Link href="/settings/notifications" className="text-brand-700 hover:underline">
              Giden kutusu →
            </Link>
          </p>
        </Card>
        <Card title="Uygulama">
          <p>Sürüm {status.version}</p>
          <p className="mt-1 text-xs text-neutral-500">
            Node {status.nodeVersion} · {uptime(status.uptimeSeconds)}dır açık · saat dilimi {status.timeZone}
          </p>
        </Card>
        <Card title="Son yedek">
          {status.lastBackup ? (
            <>
              <p>{formatDateTime(status.lastBackup.at)}</p>
              <p className="mt-1 break-all text-xs text-neutral-500">
                {status.lastBackup.file} · {status.lastBackup.sizeKb} KB
              </p>
            </>
          ) : (
            <p className="text-neutral-500">Bu sunucuda yerel yedek bulunamadı.</p>
          )}
        </Card>
        <Card title="Günlük iş (hatırlatma + temizlik)">
          <p>{status.dailyJob ? formatDateTime(status.dailyJob.lastRunAt) : "Henüz çalışmadı"}</p>
          <p className="mt-1 text-xs">
            <Link href="/settings/notifications" className="text-brand-700 hover:underline">
              Ayrıntı →
            </Link>
          </p>
        </Card>
      </div>

      {status.counts && (
        <p className="mt-4 text-sm text-neutral-500">
          Kayıtlar: {status.counts.users} aktif kullanıcı · {status.counts.customers} müşteri · {status.counts.tasks} görev · {status.counts.shoots} çekim ·{" "}
          {status.counts.transactions} finans kaydı · {status.counts.auditLogs} denetim kaydı
        </p>
      )}

      <section className="mt-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-neutral-900">Yakalanan hatalar</h2>
          <span className="text-sm text-neutral-500">{status.unresolvedErrors} açık</span>
        </div>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-5 py-3 font-medium">Son görülme</th>
                <th className="px-3 py-3 font-medium">Kaynak</th>
                <th className="px-3 py-3 font-medium">Hata</th>
                <th className="px-3 py-3 text-right font-medium">Tekrar</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {errors.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-neutral-500">
                    Kayıtlı hata yok.
                  </td>
                </tr>
              )}
              {errors.map((e) => (
                <tr key={e.id} className={`border-b border-neutral-100 align-top last:border-0 ${e.resolvedAt ? "opacity-60" : ""}`}>
                  <td className="whitespace-nowrap px-5 py-3 text-neutral-600">{formatDateTime(e.lastSeenAt)}</td>
                  <td className="px-3 py-3 text-neutral-700">{SOURCE_LABELS[e.source] ?? e.source}</td>
                  <td className="px-3 py-3">
                    <details>
                      <summary className="cursor-pointer text-neutral-900">{e.message}</summary>
                      <p className="mt-1 text-xs text-neutral-500">
                        {e.path ?? "—"}
                        {e.digest ? ` · kod ${e.digest}` : ""} · ilk {formatDateTime(e.firstSeenAt)}
                      </p>
                      {e.stack && <pre className="mt-2 max-h-48 overflow-auto rounded bg-neutral-50 p-2 text-[11px] text-neutral-600">{e.stack}</pre>}
                    </details>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-neutral-700">{e.count}</td>
                  <td className="px-5 py-3 text-right">
                    {e.resolvedAt ? (
                      <span className="text-xs text-neutral-500">Çözüldü</span>
                    ) : (
                      <form action={resolveAction}>
                        <input type="hidden" name="id" value={e.id} />
                        <button type="submit" className="text-xs text-brand-700 hover:underline">
                          Çözüldü olarak işaretle
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          Yeni hatalar Admin&apos;lere bildirim olarak düşer.
        </p>
      </section>
    </PageShell>
  );
}
