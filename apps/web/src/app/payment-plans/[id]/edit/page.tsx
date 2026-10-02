import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { auth } from "@/auth";
import { Field, PageShell, SubmitButton, inputClass } from "@/components/form-fields";
import { ApiError, requireRole } from "@/lib/api-auth";
import { kurusToTLInput, parseTLInputToKurus } from "@/lib/money";
import { orNotFound } from "@/lib/not-found";
import { FINANCE_MANAGE_ROLES, FINANCE_VIEW_ROLES } from "@/lib/roles";
import { getPaymentPlanById, updatePaymentPlan } from "@/lib/services/payment-plan-service";
import { VAT_RATES } from "@/lib/vat";
import { updatePaymentPlanSchema } from "@/lib/validations/finance";
import type { Role } from "@prisma/client";

export default async function EditPaymentPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  const user = session!.user;
  const { id } = await params;
  const { error } = await searchParams;

  // Operasyon finans verisini hiç göremez.
  if (!FINANCE_VIEW_ROLES.includes(user.role as Role)) {
    redirect("/");
  }
  const plan = await orNotFound(getPaymentPlanById(id));
  const editable = FINANCE_MANAGE_ROLES.includes(user.role as Role) && !plan.archivedAt;

  async function updateAction(formData: FormData) {
    "use server";
    await requireRole(FINANCE_MANAGE_ROLES);
    let message: string | null = null;
    try {
      const data = updatePaymentPlanSchema.parse({
        title: formData.get("title"),
        monthlyAmountKurus: parseTLInputToKurus(String(formData.get("monthlyAmount") ?? "")),
        billingDay: Number(formData.get("billingDay")),
        vatRate: formData.get("vatRate") === "" ? undefined : formData.get("vatRate"),
      });
      await updatePaymentPlan(id, data);
    } catch (e) {
      // Kullanıcının düzeltebileceği hatalar formda gösterilir; beklenmeyenler olduğu gibi fırlatılır.
      if (e instanceof ZodError) message = e.issues[0]?.message ?? "Geçersiz değer";
      else if (e instanceof ApiError) message = e.message;
      else if (e instanceof Error && e.message === "Geçersiz tutar") message = "Tutar geçersiz. Örn: 5000,00";
      else throw e;
    }
    if (message) redirect(`/payment-plans/${id}/edit?error=${encodeURIComponent(message)}`);
    revalidatePath("/payment-plans");
    redirect("/payment-plans");
  }

  return (
    <PageShell user={user} title={editable ? "Ödeme Planını Düzenle" : "Ödeme Planı"}>
      {plan.archivedAt && (
        <p className="mt-4 rounded-md bg-neutral-100 px-3 py-2 text-sm text-neutral-600">Bu plan arşivlenmiş; önce geri yüklenmeli.</p>
      )}
      {error && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <form action={editable ? updateAction : undefined} className="mt-6 rounded-2xl border border-neutral-200 bg-white shadow-sm p-6">
        <fieldset disabled={!editable} className="space-y-4">
          <div>
            <p className="text-sm font-medium text-neutral-700">Müşteri</p>
            <p className="mt-1 text-sm text-neutral-900">{plan.customer.name}</p>
          </div>
          <Field id="title" label="Başlık *">
            <input id="title" name="title" required defaultValue={plan.title} className={inputClass} />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="monthlyAmount" label="Aylık Tutar (₺) *">
              <input
                id="monthlyAmount"
                name="monthlyAmount"
                required
                inputMode="decimal"
                defaultValue={kurusToTLInput(plan.monthlyAmount)}
                className={inputClass}
              />
            </Field>
            <Field id="billingDay" label="Tahsilat Günü *">
              <input
                id="billingDay"
                name="billingDay"
                type="number"
                min={1}
                max={28}
                required
                defaultValue={plan.billingDay}
                className={inputClass}
              />
            </Field>
          </div>
          <Field id="vatRate" label="KDV oranı">
            <select id="vatRate" name="vatRate" defaultValue={plan.vatRate ?? ""} className={inputClass}>
              <option value="">— Belirtilmedi —</option>
              {VAT_RATES.map((r) => (
                <option key={r} value={r}>
                  {r === 0 ? "KDV yok (%0)" : `%${r} (tutar KDV dahil)`}
                </option>
              ))}
            </select>
          </Field>
          <p className="text-xs text-neutral-500">
            Tutarı veya tahsilat gününü değiştirmek yalnızca bundan sonra oluşacak ödeme örneklerini etkiler; oluşmuş örneklerin tutarı
            değişmez.
          </p>
        </fieldset>

        <div className="mt-4 flex items-center gap-3">
          {editable && <SubmitButton>Kaydet</SubmitButton>}
          <Link href="/payment-plans" className="text-sm text-neutral-600 hover:text-neutral-900">
            ← Ödeme Planları
          </Link>
        </div>
      </form>
    </PageShell>
  );
}
