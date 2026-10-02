import Link from "next/link";
import { redirect } from "next/navigation";
import { ReceiptText } from "lucide-react";
import type { Role } from "@prisma/client";
import { ZodError } from "zod";
import { auth } from "@/auth";
import { FinanceCategorySelect, OptionQuickSelect } from "@/components/finance-category-select";
import { Field, OptionList, PageShell, inputClass } from "@/components/form-fields";
import { PageHeader, btnPrimary } from "@/components/ui";
import { ApiError, requireRole } from "@/lib/api-auth";
import { toDateTimeLocalValue } from "@/lib/datetime";
import { parseTLInputToKurus } from "@/lib/money";
import { FINANCE_MANAGE_ROLES } from "@/lib/roles";
import { listCustomers } from "@/lib/services/customer-service";
import { createTransaction, listCounterparties } from "@/lib/services/finance-service";
import { canCreateOption, listOptions } from "@/lib/services/option-service";
import { VAT_RATES } from "@/lib/vat";
import { createTransactionSchema } from "@/lib/validations/finance";

async function createAction(formData: FormData) {
  "use server";
  await requireRole(FINANCE_MANAGE_ROLES);
  let message: string | null = null;
  try {
    const amountKurus = parseTLInputToKurus(String(formData.get("amount") ?? "0"));
    const data = createTransactionSchema.parse({
      type: formData.get("type"),
      amountKurus,
      category: formData.get("category") || undefined,
      description: formData.get("description") || undefined,
      counterparty: formData.get("counterparty") || undefined,
      paymentMethodId: formData.get("paymentMethodId") || undefined,
      vatRate: formData.get("vatRate") || undefined,
      invoiceNo: formData.get("invoiceNo") || undefined,
      occurredAt: formData.get("occurredAt") || undefined,
      customerId: formData.get("customerId") || undefined,
    });
    await createTransaction(data);
  } catch (error) {
    // Geçersiz tutar ya da bu arada kaldırılmış kategori: hata ekranı yerine formda mesaj.
    if (error instanceof ApiError) message = error.message;
    else if (error instanceof ZodError) message = error.issues[0]?.message ?? "Geçersiz veri";
    else if (error instanceof Error && !("digest" in error)) message = error.message;
    else throw error;
  }
  redirect(message ? `/finance/new?error=${encodeURIComponent(message)}` : "/finance");
}

const vatSelectClass = inputClass;

/** KDV oranı seçimi (formlar). Boş = belirtilmedi. */
function VatFields({ withInvoice = true }: { withInvoice?: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field id="vatRate" label="KDV oranı">
        <select id="vatRate" name="vatRate" defaultValue="" className={vatSelectClass}>
          <option value="">— Belirtilmedi —</option>
          {VAT_RATES.map((r) => (
            <option key={r} value={r}>
              {r === 0 ? "KDV yok (%0)" : `%${r}`}
            </option>
          ))}
        </select>
      </Field>
      {withInvoice && (
        <Field id="invoiceNo" label="Fatura no (isteğe bağlı)">
          <input id="invoiceNo" name="invoiceNo" maxLength={40} placeholder="Örn: ABC2026000123" className={inputClass} />
        </Field>
      )}
    </div>
  );
}

export default async function NewTransactionPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await auth();
  const user = session!.user;

  if (user.role === "OPERATIONS") {
    redirect("/");
  }
  if (user.role !== "ADMIN" && user.role !== "FINANCE") {
    redirect("/finance");
  }

  const { error } = await searchParams;
  const [customers, categoryOptions, methods, counterparties] = await Promise.all([
    listCustomers({ includeArchived: false }),
    listOptions({ kind: "FINANCE_CATEGORY" }),
    listOptions({ kind: "PAYMENT_METHOD" }),
    listCounterparties(),
  ]);
  const role = user.role as Role;

  return (
    <PageShell user={user} title="" width="max-w-2xl">
      <div>
        <PageHeader
          icon={ReceiptText}
          title="Yeni Gelir / Gider Kaydı"
          description="Kayıtlar sonradan değiştirilmez (muhasebe kuralı); hatalı kayıt ters kayıtla düzeltilir. Tarih ve saat varsayılan olarak şimdi."
        />
      </div>
      {error && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <form action={createAction} className="animate-fade-up mt-6 space-y-5 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field id="type" label="Tür">
            <select id="type" name="type" defaultValue="EXPENSE" className={inputClass}>
              <option value="INCOME">Gelir</option>
              <option value="EXPENSE">Gider</option>
            </select>
          </Field>
          <Field id="amount" label="Tutar (₺) *">
            <input id="amount" name="amount" required inputMode="decimal" placeholder="1250,00" className={inputClass} />
          </Field>
          <Field id="occurredAt" label="Tarih / Saat">
            <input id="occurredAt" name="occurredAt" type="datetime-local" defaultValue={toDateTimeLocalValue(new Date())} className={inputClass} />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FinanceCategorySelect categories={categoryOptions.map((c) => c.label)} canQuickAdd={canCreateOption(role, "FINANCE_CATEGORY")} />
          <OptionQuickSelect
            kind="PAYMENT_METHOD"
            name="paymentMethodId"
            label="Ödeme yöntemi"
            choices={methods.map((m) => ({ value: m.id, label: m.label }))}
            valueFrom="id"
            canQuickAdd={canCreateOption(role, "PAYMENT_METHOD")}
            emptyLabel="— Belirtilmedi —"
            addLabel="+ Yeni yöntem…"
          />
        </div>

        <VatFields />

        <Field id="counterparty" label="Kime ödendi / Kimden alındı">
          <input
            id="counterparty"
            name="counterparty"
            list="counterparty-options"
            maxLength={100}
            placeholder="Örn: Ev sahibi, Ekipman kiralama firması, freelance kurgucu"
            className={inputClass}
          />
          <datalist id="counterparty-options">
            {counterparties.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>

        <Field id="description" label="Açıklama">
          <input id="description" name="description" maxLength={300} placeholder="Örn: Ekim ayı ofis kirası" className={inputClass} />
        </Field>

        <Field id="customerId" label="Müşteri (isteğe bağlı)">
          <select id="customerId" name="customerId" defaultValue="" className={inputClass}>
            <OptionList items={customers} />
          </select>
        </Field>

        <div className="flex items-center gap-3 border-t border-neutral-100 pt-5">
          <button type="submit" className={btnPrimary}>
            Kaydet
          </button>
          <Link href="/finance" className="text-sm text-neutral-600 hover:text-neutral-900">
            Vazgeç
          </Link>
        </div>
      </form>
    </PageShell>
  );
}
