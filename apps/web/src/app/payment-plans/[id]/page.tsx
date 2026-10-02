import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, CircleAlert, Clock, History, TrendingUp, Wallet } from "lucide-react";
import { auth } from "@/auth";
import { PageShell } from "@/components/form-fields";
import { Collapsible, CountPill, PageHeader, StatCard, btnSecondary } from "@/components/ui";
import { MONTH_NAMES } from "@/lib/labels";
import { formatKurusAsTL } from "@/lib/money";
import { orNotFound } from "@/lib/not-found";
import { getPlanHistory } from "@/lib/services/payment-plan-service";

const fmtDate = (d: Date) => new Date(d).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
const fmtDateTime = (d: Date) =>
  new Date(d).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

const STATUS = {
  PAID: { label: "Ödendi", className: "bg-green-50 text-green-700", Icon: CheckCircle2 },
  OVERDUE: { label: "Gecikti", className: "bg-red-50 text-red-700", Icon: CircleAlert },
  PENDING: { label: "Bekliyor", className: "bg-amber-50 text-amber-700", Icon: Clock },
} as const;

/** Bir ödeme planının bütün geçmişi: her ay vade, tutar, durum, ödeme tarihi-saati ve yöntemi; yıllara göre. */
export default async function PaymentPlanHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const user = session!.user;
  // Ödeme planları finans verisidir: Operasyon göremez.
  if (user.role === "OPERATIONS") {
    redirect("/");
  }

  const { id } = await params;
  const { plan, totals, years } = await orNotFound(getPlanHistory(id));

  return (
    <PageShell user={user} title="" width="max-w-5xl">
      <PageHeader
        icon={History}
        title={`${plan.title} · Ödeme geçmişi`}
        description={
          <>
            <Link href={`/customers/${plan.customer.id}`} className="hover:underline">
              {plan.customer.name}
            </Link>{" "}
            · {formatKurusAsTL(plan.monthlyAmount)}/ay · her ayın {plan.billingDay}. günü · plan başlangıcı {fmtDate(plan.createdAt)}
            {plan.archivedAt ? " · arşivde" : ""}
          </>
        }
        actions={
          <Link href="/payment-plans" className={btnSecondary}>
            ← Ödeme Planları
          </Link>
        }
      />

      <div className="stagger mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Tahsil edilen"
          value={formatKurusAsTL(totals.paidKurus)}
          icon={TrendingUp}
          tone="green"
          valueClass="text-green-700"
          hint={`${totals.paidCount} / ${totals.periodCount} dönem ödendi`}
        />
        <StatCard
          label="Geciken"
          value={formatKurusAsTL(totals.overdueKurus)}
          icon={CircleAlert}
          tone={totals.overdueKurus > 0 ? "red" : "neutral"}
          valueClass={totals.overdueKurus > 0 ? "text-red-700" : "text-neutral-900"}
        />
        <StatCard label="Vadesi gelmemiş" value={formatKurusAsTL(totals.pendingKurus)} icon={Wallet} tone="amber" />
      </div>

      <div className="mt-6 space-y-4">
        {years.length === 0 && (
          <p className="rounded-2xl border border-neutral-200 bg-white p-8 text-center text-neutral-400 shadow-sm">
            Bu plan için henüz ödeme kaydı oluşmamış.
          </p>
        )}
        {years.map((y, index) => (
          <Collapsible
            key={y.year}
            title={`${y.year}`}
            icon={History}
            defaultOpen={index === 0}
            meta={
              <span className="hidden gap-2 text-xs sm:flex">
                <CountPill value={`Tahsil: ${formatKurusAsTL(y.paidKurus)}`} />
                {y.openKurus > 0 && <CountPill value={`Açık: ${formatKurusAsTL(y.openKurus)}`} alert />}
              </span>
            }
          >
            <div className="-mx-5 overflow-x-auto border-t border-neutral-100">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">Dönem</th>
                    <th className="px-3 py-3 font-medium">Vade</th>
                    <th className="px-3 py-3 text-right font-medium">Tutar</th>
                    <th className="px-3 py-3 font-medium">Durum</th>
                    <th className="px-3 py-3 font-medium">Ödeme tarihi / saati</th>
                    <th className="px-5 py-3 font-medium">Yöntem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {y.rows.map((r) => {
                    const s = STATUS[r.status];
                    return (
                      <tr key={r.id} className="transition-colors hover:bg-neutral-50">
                        <td className="px-5 py-3 font-medium text-neutral-900">{MONTH_NAMES[r.month - 1]}</td>
                        <td className="px-3 py-3 tabular-nums text-neutral-600">{fmtDate(r.dueDate)}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-neutral-900">{formatKurusAsTL(r.amountKurus)}</td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${s.className}`}>
                            <s.Icon className="h-3.5 w-3.5" aria-hidden />
                            {s.label}
                          </span>
                        </td>
                        <td className="px-3 py-3 tabular-nums text-neutral-600">{r.paidAt ? fmtDateTime(r.paidAt) : "—"}</td>
                        <td className="px-5 py-3 text-neutral-600">{r.paymentMethod ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Collapsible>
        ))}
      </div>
    </PageShell>
  );
}
