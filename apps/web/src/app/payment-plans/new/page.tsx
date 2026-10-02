import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Nav } from "@/components/nav";
import { requireRole } from "@/lib/api-auth";
import { FINANCE_MANAGE_ROLES } from "@/lib/roles";
import { VAT_RATES } from "@/lib/vat";
import { createPaymentPlanSchema } from "@/lib/validations/finance";
import { createPaymentPlan } from "@/lib/services/payment-plan-service";
import { listCustomers } from "@/lib/services/customer-service";
import { parseTLInputToKurus } from "@/lib/money";

async function createAction(formData: FormData) {
  "use server";
  await requireRole(FINANCE_MANAGE_ROLES);
  const monthlyAmountKurus = parseTLInputToKurus(String(formData.get("monthlyAmount") ?? "0"));
  const data = createPaymentPlanSchema.parse({
    customerId: formData.get("customerId"),
    title: formData.get("title"),
    monthlyAmountKurus,
    billingDay: Number(formData.get("billingDay")),
    vatRate: formData.get("vatRate") || undefined,
  });
  await createPaymentPlan(data);
  redirect("/payment-plans");
}

export default async function NewPaymentPlanPage() {
  const session = await auth();
  const user = session!.user;

  if (user.role === "OPERATIONS") {
    redirect("/");
  }
  if (user.role !== "ADMIN" && user.role !== "FINANCE") {
    redirect("/payment-plans");
  }

  const customers = await listCustomers({ includeArchived: false });

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 lg:pl-64 print:pl-0">
      <Nav userName={user.name} userRole={user.role} />
      <main className="animate-fade-up mx-auto w-full max-w-lg flex-1 px-4 py-8">
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">Yeni Ödeme Planı</h1>

        <form action={createAction} className="mt-6 space-y-4 rounded-2xl border border-neutral-200 bg-white shadow-sm p-6">
          <div>
            <label htmlFor="customerId" className="block text-sm font-medium text-neutral-700">
              Müşteri *
            </label>
            <select
              id="customerId"
              name="customerId"
              required
              defaultValue=""
              className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="" disabled>
                — Seçiniz —
              </option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="title" className="block text-sm font-medium text-neutral-700">
              Başlık *
            </label>
            <input
              id="title"
              name="title"
              required
              placeholder="Örn: Aylık Sosyal Medya Yönetimi"
              className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="monthlyAmount" className="block text-sm font-medium text-neutral-700">
                Aylık Tutar (₺) *
              </label>
              <input
                id="monthlyAmount"
                name="monthlyAmount"
                required
                inputMode="decimal"
                placeholder="5000,00"
                className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
            <div>
              <label htmlFor="billingDay" className="block text-sm font-medium text-neutral-700">
                Tahsilat Günü *
              </label>
              <input
                id="billingDay"
                name="billingDay"
                type="number"
                min={1}
                max={28}
                required
                defaultValue={5}
                className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
          </div>

          <div>
            <label htmlFor="vatRate" className="block text-sm font-medium text-neutral-700">
              KDV oranı
            </label>
            <select
              id="vatRate"
              name="vatRate"
              defaultValue=""
              className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="">— Belirtilmedi —</option>
              {VAT_RATES.map((r) => (
                <option key={r} value={r}>
                  {r === 0 ? "KDV yok (%0)" : `%${r} (tutar KDV dahil)`}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-neutral-500">&quot;Ödeme alındı&quot; ile oluşan gelir kaydına aktarılır.</p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-on-brand hover:bg-brand-700"
            >
              Kaydet
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
