import Link from "next/link";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { auth } from "@/auth";
import { Attachments } from "@/components/attachments";
import { PageShell } from "@/components/form-fields";
import { formatDateTime } from "@/lib/labels";
import { formatKurusAsTL } from "@/lib/money";
import { orNotFound } from "@/lib/not-found";
import { FINANCE_MANAGE_ROLES, FINANCE_VIEW_ROLES } from "@/lib/roles";
import { attachmentsForPage } from "@/lib/services/attachment-service";
import { getTransaction } from "@/lib/services/finance-service";

/** Finans kaydı detayı: bilgiler + fatura/dekont dosyaları. Operasyon göremez. */
export default async function TransactionPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const user = session!.user;
  const role = user.role as Role;
  if (!FINANCE_VIEW_ROLES.includes(role)) redirect("/");
  const { id } = await params;
  const t = await orNotFound(getTransaction(id));
  const files = await attachmentsForPage({ kind: "transaction", id }, role);
  const income = t.type === "INCOME";

  const rows: [string, string | null][] = [
    ["Tür", income ? "Gelir" : "Gider"],
    ["Tutar", `${income ? "+" : "−"}${formatKurusAsTL(t.amount)}`],
    ["Tarih", formatDateTime(t.occurredAt)],
    ["Kategori", t.category],
    ["Açıklama", t.description],
    [income ? "Kimden" : "Kime", t.counterparty || t.customer?.name || null],
    ["Müşteri", t.customer?.name ?? null],
    ["Ödeme yöntemi", t.paymentMethod?.label ?? null],
    ["KDV", t.vatRate !== null ? `%${t.vatRate}${t.vatAmount ? ` · ${formatKurusAsTL(t.vatAmount)}` : ""}` : null],
    ["Fatura no", t.invoiceNo],
    ["Ödeme planı", t.paymentInstance ? `${t.paymentInstance.paymentPlan.title} (${t.paymentInstance.month}/${t.paymentInstance.year})` : null],
  ];

  return (
    <PageShell user={user} title={income ? "Gelir Kaydı" : "Gider Kaydı"} width="max-w-3xl">
      <Link href="/finance" className="text-sm text-neutral-500 hover:text-neutral-800">
        ← Finans
      </Link>
      <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          {rows
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs uppercase tracking-wide text-neutral-500">{label}</dt>
                <dd className={`mt-0.5 ${label === "Tutar" ? (income ? "font-semibold text-green-700" : "font-semibold text-red-700") : "text-neutral-900"}`}>{value}</dd>
              </div>
            ))}
        </dl>
      </section>
      <Attachments
        owner={{ transactionId: t.id }}
        {...files}
        canManage={FINANCE_MANAGE_ROLES.includes(role)}
        hint="Fatura, dekont, makbuz."
      />
    </PageShell>
  );
}
