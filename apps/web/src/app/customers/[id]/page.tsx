import Link from "next/link";
import type { ReactNode } from "react";
import type { Role } from "@prisma/client";
import { auth } from "@/auth";
import { PageShell } from "@/components/form-fields";
import { Collapsible, CountPill } from "@/components/ui";
import {
  MONTH_NAMES,
  PAYMENT_STATUS_LABELS,
  PRIORITY_LABELS,
  formatDate,
  formatDateTime,
} from "@/lib/labels";
import { formatKurusAsTL } from "@/lib/money";
import { badgeClass, targetLabel } from "@/lib/options";
import { orNotFound } from "@/lib/not-found";
import { FINANCE_VIEW_ROLES } from "@/lib/roles";
import { getCustomerOverview } from "@/lib/services/customer-service";
import { getCustomerActivity } from "@/lib/services/activity-service";
import { AUDIT_ACTIONS } from "@/lib/audit";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/api-auth";
import { anonymizeCustomer } from "@/lib/services/privacy-service";

/** Müşteri detayındaki bölüm: açılıp kapanır (akordeon), başlıkta sayaç; boşsa kısa not. */
function Section({ title, count, empty, children }: { title: string; count: number; empty: string; children: ReactNode }) {
  return (
    <Collapsible title={title} meta={<CountPill value={count} />} defaultOpen={count > 0}>
      {count === 0 ? <p className="text-sm text-neutral-400">{empty}</p> : <div className="-mx-5 divide-y divide-neutral-100 border-t border-neutral-100">{children}</div>}
    </Collapsible>
  );
}

const rowClass = "flex items-start justify-between gap-4 px-5 py-3 text-sm transition-colors hover:bg-neutral-50";

async function anonymizeAction(formData: FormData) {
  "use server";
  await requireRole(["ADMIN"]);
  const id = String(formData.get("id"));
  await anonymizeCustomer(id);
  revalidatePath(`/customers/${id}`);
  revalidatePath("/customers");
  redirect(`/customers/${id}`);
}

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const user = session!.user;
  const { id } = await params;
  const canManage = user.role === "ADMIN" || user.role === "OPERATIONS";
  const canSeeFinance = FINANCE_VIEW_ROLES.includes(user.role as Role);

  const [{ customer, tasks, shoots, appointments, finance }, activity] = await Promise.all([
    orNotFound(getCustomerOverview(id, { includeFinance: canSeeFinance })),
    getCustomerActivity(id, { includeFinance: canSeeFinance }),
  ]);

  return (
    <PageShell user={user} title={customer.name} width="max-w-5xl">
      <div className="mt-4 rounded-2xl border border-neutral-200 bg-white shadow-sm p-5">
        <div className="flex items-start justify-between gap-4">
          <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-neutral-500">İletişim</dt>
              <dd className="text-neutral-900">{customer.contact || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">Durum</dt>
              <dd className="text-neutral-900">{customer.archivedAt ? "Arşivde" : "Aktif"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-neutral-500">Etiketler</dt>
              <dd className="mt-0.5 flex flex-wrap gap-1">
                {customer.tags.length === 0 && <span className="text-neutral-900">—</span>}
                {customer.tags.map((t) => (
                  <Link key={t} href={`/customers?tag=${encodeURIComponent(t)}`} className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 hover:bg-neutral-200">
                    {t}
                  </Link>
                ))}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-neutral-500">Notlar</dt>
              <dd className="whitespace-pre-line text-neutral-900">{customer.notes || "—"}</dd>
            </div>
          </dl>
          <div className="flex shrink-0 gap-2">
            <Link
              href="/customers"
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
            >
              ← Müşteriler
            </Link>
            {canManage && (
              <Link
                href={`/customers/${customer.id}/edit`}
                className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-on-brand hover:bg-brand-700"
              >
                Düzenle
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="stagger mt-6 grid items-start gap-4 lg:grid-cols-2">
        <Section title="Görevler" count={tasks.length} empty="Bu müşteriye ait görev yok">
          {tasks.map((t) => (
            <div key={t.id} className={rowClass}>
              <div>
                <Link href={`/tasks/${t.id}/edit`} className="font-medium text-neutral-900 hover:underline">
                  {t.title}
                </Link>
                <p className="text-xs text-neutral-500">
                  {[t.assignee?.name, t.dueDate ? `son tarih ${formatDate(t.dueDate)}` : null].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              <div className="shrink-0 text-right text-xs text-neutral-500">
                <p>{t.status.label}</p>
                <p>{PRIORITY_LABELS[t.priority]}</p>
              </div>
            </div>
          ))}
        </Section>

        <Section title="Çekimler" count={shoots.length} empty="Bu müşteriye ait çekim yok">
          {shoots.map((s) => (
            <div key={s.id} className={rowClass}>
              <div>
                <Link href={`/shoots/${s.id}/edit`} className="font-medium text-neutral-900 hover:underline">
                  {formatDateTime(s.scheduledAt)} · {s.type.label}
                </Link>
                <p className="text-xs text-neutral-500">
                  {[s.location, s.assignee?.name].filter(Boolean).join(" · ") || "—"}
                </p>
                {s.publishTargets.length > 0 && (
                  <p className="text-xs text-neutral-500">Paylaşım: {s.publishTargets.map(targetLabel).join(", ")}</p>
                )}
                {s.equipment && (
                  <p className="text-xs text-neutral-500">Ekipman: {s.equipment.split("\n").filter(Boolean).join(", ")}</p>
                )}
                {s.deliveryLink && (
                  <a href={s.deliveryLink} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">
                    Teslim linki
                  </a>
                )}
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${badgeClass(s.deliveryStatus.color)}`}>
                {s.deliveryStatus.label}
              </span>
            </div>
          ))}
        </Section>

        <Section title="Randevular" count={appointments.length} empty="Bu müşteriye ait randevu yok">
          {appointments.map((a) => (
            <div key={a.id} className={rowClass}>
              <Link href={`/calendar/${a.id}/edit`} className="font-medium text-neutral-900 hover:underline">
                {a.title}
              </Link>
              <span className="shrink-0 text-xs text-neutral-500">{formatDateTime(a.startsAt)}</span>
            </div>
          ))}
        </Section>

        {finance && (
          <Section title="Ödeme planları" count={finance.plans.length} empty="Bu müşteriye ait ödeme planı yok">
            {finance.plans.map((p) => (
              <div key={p.id} className="px-4 py-3 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <span className="font-medium text-neutral-900">{p.title}</span>
                  <span className="shrink-0 text-neutral-900">{formatKurusAsTL(p.monthlyAmount)} / ay</span>
                </div>
                <p className="text-xs text-neutral-500">Her ayın {p.billingDay}. günü</p>
                {p.instances.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {p.instances.map((i) => (
                      <li
                        key={i.id}
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          i.status === "PAID" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {MONTH_NAMES[i.month - 1]} {i.year} · {PAYMENT_STATUS_LABELS[i.status]}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </Section>
        )}
      </div>

      {finance && (
        <div className="mt-6">
          <Section title="Finans hareketleri" count={finance.transactions.length} empty="Bu müşteriyle ilişkili finans kaydı yok">
            <div className="flex gap-8 bg-neutral-50 px-4 py-3 text-sm">
              <span className="text-neutral-600">
                Toplam gelir: <strong className="text-green-700">{formatKurusAsTL(finance.incomeKurus)}</strong>
              </span>
              <span className="text-neutral-600">
                Toplam gider: <strong className="text-red-700">{formatKurusAsTL(finance.expenseKurus)}</strong>
              </span>
            </div>
            {finance.transactions.map((t) => (
              <div key={t.id} className={rowClass}>
                <div>
                  <p className="text-neutral-900">{t.description || t.category || (t.type === "INCOME" ? "Gelir" : "Gider")}</p>
                  <p className="text-xs text-neutral-500">
                    {formatDate(t.occurredAt)}
                    {t.category ? ` · ${t.category}` : ""}
                  </p>
                </div>
                <span className={`shrink-0 font-medium ${t.type === "INCOME" ? "text-green-700" : "text-red-700"}`}>
                  {t.type === "INCOME" ? "+" : "−"}
                  {formatKurusAsTL(t.amount)}
                </span>
              </div>
            ))}
          </Section>
        </div>
      )}

      <div className="mt-6">
        <Collapsible title="Aktivite geçmişi" meta={<CountPill value={activity.length} />} defaultOpen={false}>
          {activity.length === 0 ? (
            <p className="text-sm text-neutral-400">Henüz kayıtlı bir değişiklik yok.</p>
          ) : (
            <ol className="-mx-5 divide-y divide-neutral-100 border-t border-neutral-100">
              {activity.map((a) => (
                <li key={a.id} className="flex gap-3 px-5 py-2.5 text-sm">
                  <span className="w-32 shrink-0 tabular-nums text-xs text-neutral-500">{formatDateTime(a.createdAt)}</span>
                  <span className="min-w-0">
                    <span className="text-neutral-900">
                      {a.user?.name ?? "Sistem"} · {a.entity ?? "Kayıt"} {AUDIT_ACTIONS[a.action as keyof typeof AUDIT_ACTIONS]?.toLocaleLowerCase("tr-TR").replace("kayıt ", "") ?? a.action}
                    </span>
                    {a.summary && <span className="block truncate text-xs text-neutral-500">{a.summary}</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-3 text-xs text-neutral-500">
            Müşteriye ve ona bağlı görev, çekim, randevu{canSeeFinance ? ", finans" : ""} kayıtlarına yapılan son 30 değişiklik (denetim kaydından).
          </p>
        </Collapsible>
      </div>
      {user.role === "ADMIN" && !customer.anonymizedAt && (
        <details className="mt-6 rounded-2xl border border-red-200 bg-white p-5 shadow-sm">
          <summary className="cursor-pointer text-sm font-medium text-red-700">KVKK: kişisel bilgileri sil (silme talebi)</summary>
          <p className="mt-2 text-sm text-neutral-600">
            Müşterinin adı, iletişim bilgisi, notları ve etiketleri kalıcı olarak silinir; müşteri arşive alınır. Finans kayıtları ve ödeme
            planları mevzuat gereği saklanır ama artık anonim müşteriye bağlı görünür. Bu işlem geri alınamaz.
          </p>
          <form action={anonymizeAction} className="mt-3">
            <input type="hidden" name="id" value={customer.id} />
            <button type="submit" className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-on-brand hover:bg-red-700">
              Kişisel bilgileri kalıcı olarak sil
            </button>
          </form>
        </details>
      )}
      {customer.anonymizedAt && (
        <p className="mt-6 rounded-md bg-neutral-100 px-4 py-3 text-sm text-neutral-600">Bu müşterinin kişisel bilgileri KVKK talebiyle silinmiştir.</p>
      )}
    </PageShell>
  );
}
