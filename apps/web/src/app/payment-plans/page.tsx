import Link from "next/link";
import { markPaidSchema } from "@/lib/validations/finance";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { CalendarClock, CheckCircle2, CircleAlert, Clock, History, Repeat } from "lucide-react";
import { ZodError } from "zod";
import { auth } from "@/auth";
import { Nav } from "@/components/nav";
import { PageHeader, btnPrimary } from "@/components/ui";
import { ApiError, requireRole } from "@/lib/api-auth";
import { MONTH_NAMES } from "@/lib/labels";
import { formatKurusAsTL } from "@/lib/money";
import { FINANCE_MANAGE_ROLES } from "@/lib/roles";
import { listOptions } from "@/lib/services/option-service";
import {
  archivePaymentPlan,
  ensureCurrentMonthInstance,
  listPaymentPlans,
  markPaymentInstancePaid,
  restorePaymentPlan,
} from "@/lib/services/payment-plan-service";

function isOverdue(year: number, month: number, billingDay: number, status: string) {
  if (status !== "PENDING") return false;
  const due = new Date(year, month - 1, billingDay, 23, 59, 59);
  return due < new Date();
}

const fmtDateTime = (d: Date) =>
  new Date(d).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default async function PaymentPlansPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await auth();
  const user = session!.user;

  if (user.role === "OPERATIONS") {
    redirect("/");
  }

  const canManage = user.role === "ADMIN" || user.role === "FINANCE";
  const { error } = await searchParams;
  const [plans, methods] = await Promise.all([listPaymentPlans(false), listOptions({ kind: "PAYMENT_METHOD" })]);

  async function generateAction(formData: FormData) {
    "use server";
    await requireRole(FINANCE_MANAGE_ROLES);
    const planId = formData.get("planId") as string;
    await ensureCurrentMonthInstance(planId);
    revalidatePath("/payment-plans");
  }

  async function markPaidAction(formData: FormData) {
    "use server";
    await requireRole(FINANCE_MANAGE_ROLES);
    let message: string | null = null;
    try {
      await markPaymentInstancePaid(String(formData.get("instanceId")), {
        paymentMethodId: (formData.get("paymentMethodId") as string) || undefined,
        invoiceNo: markPaidSchema.shape.invoiceNo.parse((formData.get("invoiceNo") as string) || undefined),
      });
    } catch (e) {
      if (e instanceof ApiError) message = e.message;
      else if (e instanceof ZodError) message = e.issues[0]?.message ?? "Geçersiz veri";
      else throw e;
    }
    revalidatePath("/payment-plans");
    revalidatePath("/finance");
    if (message) redirect(`/payment-plans?error=${encodeURIComponent(message)}`);
  }

  async function archiveAction(formData: FormData) {
    "use server";
    await requireRole(FINANCE_MANAGE_ROLES);
    await archivePaymentPlan(formData.get("id") as string);
    revalidatePath("/payment-plans");
  }

  async function restoreAction(formData: FormData) {
    "use server";
    await requireRole(FINANCE_MANAGE_ROLES);
    await restorePaymentPlan(formData.get("id") as string);
    revalidatePath("/payment-plans");
  }

  const now = new Date();

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 lg:pl-64 print:pl-0">
      <Nav userName={user.name} userRole={user.role} />
      <main className="animate-fade-up mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <PageHeader
          icon={Repeat}
          title="Ödeme Planları"
          description="Müşterilerden her ay düzenli beklenen ödemeler (aylık hizmet ücretleri). Her ay için bir ödeme kaydı oluşur; müşteri ödeyince “Ödeme alındı” deyince tarih, saat ve yöntemle Finans'a gelir kaydı olarak düşer. Planın bütün geçmişi “Ödeme geçmişi”nde."
          actions={
            canManage && (
              <Link href="/payment-plans/new" className={btnPrimary}>
                + Yeni Plan
              </Link>
            )
          }
        />
        {error && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        <div className="stagger mt-6 space-y-4">
          {plans.length === 0 && (
            <p className="rounded-2xl border border-neutral-200 bg-white p-8 text-center text-neutral-400 shadow-sm">Kayıtlı ödeme planı yok</p>
          )}
          {plans.map((plan) => {
            const current = plan.instances.find((i) => i.year === now.getFullYear() && i.month === now.getMonth() + 1);
            const currentOverdue = current ? isOverdue(current.year, current.month, plan.billingDay, current.status) : false;
            const tone = !current
              ? "border-neutral-200"
              : current.status === "PAID"
                ? "border-green-200"
                : currentOverdue
                  ? "border-red-200"
                  : "border-amber-200";
            return (
              <div key={plan.id} className={`rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md ${tone}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-neutral-900">{plan.title}</p>
                    <p className="mt-0.5 text-sm text-neutral-500">
                      <Link href={`/customers/${plan.customer.id}`} className="hover:underline">
                        {plan.customer.name}
                      </Link>{" "}
                      · <span className="tabular-nums font-medium text-neutral-700">{formatKurusAsTL(plan.monthlyAmount)}</span>/ay · her ayın{" "}
                      {plan.billingDay}. günü
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    <Link href={`/payment-plans/${plan.id}`} className="inline-flex items-center gap-1.5 font-medium text-brand-600 hover:text-brand-700">
                      <History className="h-4 w-4" aria-hidden /> Ödeme geçmişi
                    </Link>
                    <Link href={`/payment-plans/${plan.id}/edit`} className="text-neutral-600 hover:text-neutral-900">
                      {canManage ? "Düzenle" : "Detay"}
                    </Link>
                    {canManage && (
                      <form action={plan.archivedAt ? restoreAction : archiveAction}>
                        <input type="hidden" name="id" value={plan.id} />
                        <button type="submit" className={plan.archivedAt ? "text-neutral-600 hover:text-neutral-900" : "text-red-600 hover:text-red-800"}>
                          {plan.archivedAt ? "Geri Yükle" : "Arşivle"}
                        </button>
                      </form>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-neutral-100 pt-4">
                  <span className="text-sm text-neutral-500">
                    {MONTH_NAMES[now.getMonth()]} {now.getFullYear()}:
                  </span>
                  {current ? (
                    <>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                          current.status === "PAID"
                            ? "bg-green-50 text-green-700"
                            : currentOverdue
                              ? "bg-red-50 text-red-700"
                              : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {current.status === "PAID" ? (
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                        ) : currentOverdue ? (
                          <CircleAlert className="h-3.5 w-3.5" aria-hidden />
                        ) : (
                          <Clock className="h-3.5 w-3.5" aria-hidden />
                        )}
                        {current.status === "PAID"
                          ? `Ödendi${current.paidAt ? ` · ${fmtDateTime(current.paidAt)}` : ""}`
                          : currentOverdue
                            ? "Gecikti"
                            : "Bekliyor"}
                      </span>
                      {canManage && current.status !== "PAID" && (
                        <form action={markPaidAction} className="flex flex-wrap items-center gap-2">
                          <input type="hidden" name="instanceId" value={current.id} />
                          <select
                            name="paymentMethodId"
                            defaultValue=""
                            aria-label="Ödeme yöntemi"
                            className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm text-neutral-900"
                          >
                            <option value="">Yöntem (isteğe bağlı)</option>
                            {methods.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.label}
                              </option>
                            ))}
                          </select>
                          <input
                            name="invoiceNo"
                            maxLength={40}
                            placeholder="Fatura no"
                            aria-label="Fatura no (isteğe bağlı)"
                            className="w-28 rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm text-neutral-900"
                          />
                          <button type="submit" className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-on-brand shadow-sm transition hover:bg-brand-700 active:scale-[0.98]">
                            Ödeme alındı
                          </button>
                        </form>
                      )}
                    </>
                  ) : (
                    canManage && (
                      <form action={generateAction}>
                        <input type="hidden" name="planId" value={plan.id} />
                        <button type="submit" className="inline-flex items-center gap-1.5 text-sm text-neutral-600 underline hover:no-underline">
                          <CalendarClock className="h-4 w-4" aria-hidden /> Bu ayın ödeme kaydını oluştur
                        </button>
                      </form>
                    )
                  )}
                </div>

                {plan.instances.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 text-xs text-neutral-400">Son aylar:</span>
                    {plan.instances.map((i) => {
                      const late = isOverdue(i.year, i.month, plan.billingDay, i.status);
                      return (
                        <span
                          key={i.id}
                          title={`${MONTH_NAMES[i.month - 1]} ${i.year} — ${
                            i.status === "PAID" ? `ödendi${i.paidAt ? ` (${fmtDateTime(i.paidAt)})` : ""}` : late ? "gecikti" : "bekliyor"
                          }`}
                          className={`rounded-md px-1.5 py-0.5 text-[11px] tabular-nums ${
                            i.status === "PAID" ? "bg-green-50 text-green-700" : late ? "bg-red-50 text-red-700" : "bg-neutral-100 text-neutral-500"
                          }`}
                        >
                          {String(i.month).padStart(2, "0")}/{i.year}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
