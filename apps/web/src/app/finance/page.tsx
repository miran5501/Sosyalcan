import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  CalendarRange,
  CreditCard,
  Layers,
  Paperclip,
  Percent,
  PieChart,
  Receipt,
  Scale,
  Search,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { auth } from "@/auth";
import { Nav } from "@/components/nav";
import { PrintButton } from "@/components/print-button";
import { Collapsible, CountPill, PageHeader, StatCard, Tabs, btnPrimary, btnSecondary } from "@/components/ui";
import { parseAnchor, shiftAnchor } from "@/lib/calendar";
import { MONTH_NAMES } from "@/lib/labels";
import { formatKurusAsTL } from "@/lib/money";
import {
  categoryBreakdown,
  listTransactions,
  monthlySummary,
  yearlyReport,
  yearsOverview,
  type ExpenseCategoryRow,
} from "@/lib/services/finance-service";
import { listOptions } from "@/lib/services/option-service";
import { transactionFilterSchema } from "@/lib/validations/finance";

type View = "month" | "year" | "all";
type Params = { view?: string; month?: string; year?: string; type?: string; category?: string; method?: string; q?: string };

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const fmtDateTime = (d: Date) =>
  new Date(d).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const inputClass =
  "rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

/** Kategori dağılımı: yatay çubuklar (dolma animasyonlu). */
function Breakdown({ rows, barClass, empty }: { rows: ExpenseCategoryRow[]; barClass: string; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-neutral-400">{empty}</p>;
  return (
    <ul className="space-y-3">
      {rows.map((c) => (
        <li key={c.category}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-neutral-900">
              {c.category} <span className="text-xs text-neutral-400">({c.count} kayıt)</span>
            </span>
            <span className="shrink-0 tabular-nums text-neutral-700">
              {formatKurusAsTL(c.amountKurus)} <span className="text-xs text-neutral-400">%{c.percent.toLocaleString("tr-TR")}</span>
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-neutral-100">
            <div className={`animate-grow-x h-full rounded-full ${barClass}`} style={{ width: `${Math.min(c.percent, 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function FinancePage({ searchParams }: { searchParams: Promise<Params> }) {
  const session = await auth();
  const user = session!.user;

  // Operasyon finans verisini hic goremez (gereksinim dokumani bolum 2)
  if (user.role === "OPERATIONS") {
    redirect("/");
  }
  const canManage = user.role === "ADMIN" || user.role === "FINANCE";

  const params = await searchParams;
  const view: View = params.view === "year" ? "year" : params.view === "all" ? "all" : "month";
  const anchor = parseAnchor({ month: params.month });
  const year = view === "year" ? Number(params.year) || new Date().getFullYear() : anchor.getFullYear();
  const month = anchor.getMonth() + 1;

  const actions = (
    <>
      <PrintButton />
      {user.role === "ADMIN" && (
        <Link href="/settings/options?tab=finance" className={btnSecondary}>
          Kategoriler ve Yöntemler
        </Link>
      )}
      {canManage && (
        <Link href="/finance/new" className={btnPrimary}>
          + Yeni Kayıt
        </Link>
      )}
    </>
  );

  const tabs = (
    <Tabs
      items={[
        { href: `/finance?month=${monthKey(anchor)}`, label: "Aylık", active: view === "month" },
        { href: `/finance?view=year&year=${year}`, label: "Yıllık", active: view === "year" },
        { href: "/finance?view=all", label: "Tüm Yıllar", active: view === "all" },
      ]}
    />
  );

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 lg:pl-64 print:pl-0">
      <Nav userName={user.name} userRole={user.role} />
      <main className="animate-fade-up mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <PageHeader
          icon={Wallet}
          title="Finans"
          description="Ajansa giren ve çıkan her paranın kaydı: ne zaman, ne kadar, hangi kategoride, kime/kimden ve hangi yöntemle. Müşterilerden düzenli beklenen ödemeler Ödeme Planları'nda; ödeme alındığında buraya otomatik gelir kaydı düşer."
          actions={actions}
        />
        <div className="mt-5">{tabs}</div>

        {view === "month" && <MonthView anchor={anchor} year={year} month={month} params={params} />}
        {view === "year" && <YearView year={year} />}
        {view === "all" && <AllYearsView />}

        <div className="mt-6 flex flex-wrap gap-6 print:hidden">
          <Link href="/payment-plans" className="text-sm text-neutral-600 hover:text-neutral-900 hover:underline">
            Ödeme Planları →
          </Link>
          <Link href="/finance/revenue-share" className="text-sm text-neutral-600 hover:text-neutral-900 hover:underline">
            Gelir Dağıtımı →
          </Link>
        </div>
      </main>
    </div>
  );
}

async function MonthView({ anchor, year, month, params }: { anchor: Date; year: number; month: number; params: Params }) {
  const filters = transactionFilterSchema.parse({
    type: params.type || undefined,
    category: params.category || undefined,
    paymentMethodId: params.method || undefined,
    q: params.q || undefined,
  });
  const filtered = Boolean(filters.type || filters.category || filters.paymentMethodId || filters.q);
  const periodLabel = `${MONTH_NAMES[month - 1]} ${year}`;

  const [transactions, summary, expenses, incomes, categories, methods] = await Promise.all([
    listTransactions({ year, month, ...filters }),
    monthlySummary(year, month),
    categoryBreakdown("EXPENSE", year, month),
    categoryBreakdown("INCOME", year, month),
    listOptions({ kind: "FINANCE_CATEGORY" }),
    listOptions({ kind: "PAYMENT_METHOD" }),
  ]);

  return (
    <>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-neutral-900">{periodLabel}</h2>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Link href={`/finance?month=${monthKey(shiftAnchor("month", anchor, -1))}`} className={btnSecondary}>
            ← Önceki ay
          </Link>
          <Link href={`/finance?month=${monthKey(shiftAnchor("month", anchor, 1))}`} className={btnSecondary}>
            Sonraki ay →
          </Link>
          <a href={`/api/finance/export?year=${year}&month=${month}`} className={btnSecondary}>
            {"Excel'e aktar (CSV)"}
          </a>
        </div>
      </div>
      <p className="mt-1 hidden text-sm text-neutral-500 print:block">Finans raporu · {periodLabel}</p>

      <div className="stagger mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Gelir" value={formatKurusAsTL(summary.incomeKurus)} icon={TrendingUp} tone="green" valueClass="text-green-700" />
        <StatCard label="Gider" value={formatKurusAsTL(summary.expenseKurus)} icon={TrendingDown} tone="red" valueClass="text-red-700" />
        <StatCard
          label="Net"
          value={formatKurusAsTL(summary.netKurus)}
          icon={Scale}
          tone={summary.netKurus < 0 ? "red" : "blue"}
          valueClass={summary.netKurus < 0 ? "text-red-700" : "text-neutral-900"}
        />
      </div>

      {(summary.vatCollectedKurus > 0 || summary.vatPaidKurus > 0) && (
        <div className="mt-4">
          <Collapsible title="KDV özeti" icon={Percent} tone="blue" defaultOpen={false} meta={<CountPill value={formatKurusAsTL(summary.vatPayableKurus)} />}>
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-neutral-500">Hesaplanan KDV (gelirlerde)</dt>
                <dd className="mt-0.5 font-medium text-neutral-900">{formatKurusAsTL(summary.vatCollectedKurus)}</dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">İndirilecek KDV (giderlerde)</dt>
                <dd className="mt-0.5 font-medium text-neutral-900">{formatKurusAsTL(summary.vatPaidKurus)}</dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">{summary.vatPayableKurus >= 0 ? "Ödenecek KDV" : "Devreden KDV"}</dt>
                <dd className={`mt-0.5 font-semibold ${summary.vatPayableKurus >= 0 ? "text-red-700" : "text-green-700"}`}>
                  {formatKurusAsTL(Math.abs(summary.vatPayableKurus))}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-neutral-500">
              Yalnızca KDV oranı girilmiş kayıtlar hesaba katılır. Tutarlar KDV dahildir; resmi beyan için muhasebecinizle kontrol edin.
            </p>
          </Collapsible>
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Collapsible title="Gider dağılımı" icon={PieChart} tone="red" meta={<CountPill value={formatKurusAsTL(expenses.totalKurus)} />}>
          <Breakdown rows={expenses.categories} barClass="bg-red-400" empty="Bu ay gider kaydı yok" />
        </Collapsible>
        <Collapsible title="Gelir dağılımı" icon={PieChart} tone="green" meta={<CountPill value={formatKurusAsTL(incomes.totalKurus)} />}>
          <Breakdown rows={incomes.categories} barClass="bg-green-500" empty="Bu ay gelir kaydı yok" />
        </Collapsible>
      </div>

      <div className="mt-4">
        <Collapsible title="Kayıtlar" icon={Receipt} meta={<CountPill value={`${transactions.length} kayıt`} />}>
          <form method="get" action="/finance" className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto] print:hidden">
            <input type="hidden" name="month" value={monthKey(anchor)} />
            <label className="relative">
              <span className="sr-only">Ara</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden />
              <input name="q" defaultValue={filters.q ?? ""} placeholder="Açıklama, kime/kimden, müşteri…" className={`${inputClass} w-full pl-9`} />
            </label>
            <select name="type" defaultValue={filters.type ?? ""} aria-label="Tür" className={inputClass}>
              <option value="">Tüm türler</option>
              <option value="INCOME">Gelir</option>
              <option value="EXPENSE">Gider</option>
            </select>
            <select name="category" defaultValue={filters.category ?? ""} aria-label="Kategori" className={inputClass}>
              <option value="">Tüm kategoriler</option>
              {categories.map((c) => (
                <option key={c.id} value={c.label}>
                  {c.label}
                </option>
              ))}
              <option value="__none__">Kategorisiz</option>
            </select>
            <select name="method" defaultValue={filters.paymentMethodId ?? ""} aria-label="Ödeme yöntemi" className={inputClass}>
              <option value="">Tüm yöntemler</option>
              {methods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button type="submit" className={btnPrimary}>
                Süz
              </button>
              {filtered && (
                <Link href={`/finance?month=${monthKey(anchor)}`} className={btnSecondary}>
                  Temizle
                </Link>
              )}
            </div>
          </form>

          <div className="-mx-5 overflow-x-auto border-t border-neutral-100">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Tarih / Saat</th>
                  <th className="px-3 py-3 font-medium">Tür</th>
                  <th className="px-3 py-3 font-medium">Kategori</th>
                  <th className="px-3 py-3 font-medium">Açıklama</th>
                  <th className="px-3 py-3 font-medium">Kime / Kimden</th>
                  <th className="px-3 py-3 font-medium">Yöntem</th>
                  <th className="px-5 py-3 text-right font-medium">Tutar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {transactions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-neutral-400">
                      {filtered ? "Süzgece uyan kayıt yok" : "Bu ay kayıtlı işlem yok"}
                    </td>
                  </tr>
                )}
                {transactions.map((t) => (
                  <tr key={t.id} className="transition-colors hover:bg-neutral-50">
                    <td className="whitespace-nowrap px-5 py-3 tabular-nums text-neutral-600">{fmtDateTime(t.occurredAt)}</td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                          t.type === "INCOME" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                        }`}
                      >
                        {t.type === "INCOME" ? <ArrowDownLeft className="h-3 w-3" aria-hidden /> : <ArrowUpRight className="h-3 w-3" aria-hidden />}
                        {t.type === "INCOME" ? "Gelir" : "Gider"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-neutral-600">{t.category || "—"}</td>
                    <td className="px-3 py-3 text-neutral-900">
                      <Link href={`/finance/${t.id}`} className="hover:text-brand-700 hover:underline">
                        {t.description || "Ayrıntı"}
                      </Link>
                      {t._count.attachments > 0 && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs text-neutral-500" title={`${t._count.attachments} dosya`}>
                          <Paperclip className="h-3 w-3" aria-hidden />
                          {t._count.attachments}
                        </span>
                      )}
                      {(t.invoiceNo || t.vatRate !== null) && (
                        <span className="mt-0.5 block text-xs text-neutral-500">
                          {[t.invoiceNo && `Fatura ${t.invoiceNo}`, t.vatRate !== null && `KDV %${t.vatRate}${t.vatAmount ? ` · ${formatKurusAsTL(t.vatAmount)}` : ""}`]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-neutral-600">{t.counterparty || t.customer?.name || "—"}</td>
                    <td className="px-3 py-3 text-neutral-600">{t.paymentMethod?.label || "—"}</td>
                    <td
                      className={`whitespace-nowrap px-5 py-3 text-right font-medium tabular-nums ${
                        t.type === "INCOME" ? "text-green-700" : "text-red-700"
                      }`}
                    >
                      {t.type === "INCOME" ? "+" : "−"}
                      {formatKurusAsTL(t.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Collapsible>
      </div>
    </>
  );
}

async function YearView({ year }: { year: number }) {
  const report = await yearlyReport(year);
  const max = Math.max(1, ...report.months.map((m) => Math.max(m.incomeKurus, m.expenseKurus)));
  const pct = (v: number) => `${Math.max(v > 0 ? 2 : 0, Math.round((v / max) * 100))}%`;

  return (
    <>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-neutral-900">{year} yılı</h2>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Link href={`/finance?view=year&year=${year - 1}`} className={btnSecondary}>
            ← {year - 1}
          </Link>
          <Link href={`/finance?view=year&year=${year + 1}`} className={btnSecondary}>
            {year + 1} →
          </Link>
          <a href={`/api/finance/export?year=${year}`} className={btnSecondary}>
            {"Yılı Excel'e aktar"}
          </a>
        </div>
      </div>
      <p className="mt-1 hidden text-sm text-neutral-500 print:block">Finans raporu · {year}</p>

      <div className="stagger mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Yıllık gelir" value={formatKurusAsTL(report.total.incomeKurus)} icon={TrendingUp} tone="green" valueClass="text-green-700" />
        <StatCard label="Yıllık gider" value={formatKurusAsTL(report.total.expenseKurus)} icon={TrendingDown} tone="red" valueClass="text-red-700" />
        <StatCard
          label="Yıllık net"
          value={formatKurusAsTL(report.total.netKurus)}
          icon={Scale}
          tone={report.total.netKurus < 0 ? "red" : "blue"}
          valueClass={report.total.netKurus < 0 ? "text-red-700" : "text-neutral-900"}
        />
        <StatCard label="Kayıt sayısı" value={report.total.count} icon={Layers} tone="purple" hint="Yıl boyunca girilen işlem" />
      </div>

      <div className="mt-4">
        <Collapsible title="Aylara göre gelir ve gider" icon={BarChart3} meta={<CountPill value={`${year}`} />}>
          {report.total.count === 0 ? (
            <p className="text-sm text-neutral-400">Bu yıl kayıtlı işlem yok</p>
          ) : (
            <>
              <div className="flex h-48 items-end gap-1.5 sm:gap-3" role="img" aria-label={`${year} aylık gelir ve gider grafiği`}>
                {report.months.map((m) => (
                  <Link
                    key={m.month}
                    href={`/finance?month=${year}-${String(m.month).padStart(2, "0")}`}
                    title={`${MONTH_NAMES[m.month - 1]}: gelir ${formatKurusAsTL(m.incomeKurus)}, gider ${formatKurusAsTL(m.expenseKurus)}`}
                    className="group flex h-full flex-1 flex-col items-center justify-end gap-1"
                  >
                    <div className="flex h-full w-full items-end justify-center gap-0.5">
                      <div className="animate-grow-y w-1/2 max-w-4 rounded-t bg-green-500 group-hover:opacity-80" style={{ height: pct(m.incomeKurus) }} />
                      <div className="animate-grow-y w-1/2 max-w-4 rounded-t bg-red-400 group-hover:opacity-80" style={{ height: pct(m.expenseKurus) }} />
                    </div>
                    <span className="text-[10px] text-neutral-500 sm:text-xs">{MONTH_NAMES[m.month - 1].slice(0, 3)}</span>
                  </Link>
                ))}
              </div>
              <div className="mt-3 flex gap-4 text-xs text-neutral-500">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-green-500" aria-hidden /> Gelir
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-red-400" aria-hidden /> Gider
                </span>
                <span>Bir aya tıklayınca o ayın kayıtları açılır.</span>
              </div>

              <div className="-mx-5 mt-5 overflow-x-auto border-t border-neutral-100">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                    <tr>
                      <th className="px-5 py-3 font-medium">Ay</th>
                      <th className="px-3 py-3 text-right font-medium">Gelir</th>
                      <th className="px-3 py-3 text-right font-medium">Gider</th>
                      <th className="px-3 py-3 text-right font-medium">Net</th>
                      <th className="px-5 py-3 text-right font-medium">Kayıt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 tabular-nums">
                    {report.months.map((m) => (
                      <tr key={m.month} className="transition-colors hover:bg-neutral-50">
                        <td className="px-5 py-2.5">
                          <Link href={`/finance?month=${year}-${String(m.month).padStart(2, "0")}`} className="text-neutral-900 hover:underline">
                            {MONTH_NAMES[m.month - 1]}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 text-right text-green-700">{m.incomeKurus ? formatKurusAsTL(m.incomeKurus) : "—"}</td>
                        <td className="px-3 py-2.5 text-right text-red-700">{m.expenseKurus ? formatKurusAsTL(m.expenseKurus) : "—"}</td>
                        <td className={`px-3 py-2.5 text-right ${m.netKurus < 0 ? "text-red-700" : "text-neutral-900"}`}>
                          {m.count ? formatKurusAsTL(m.netKurus) : "—"}
                        </td>
                        <td className="px-5 py-2.5 text-right text-neutral-500">{m.count || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Collapsible>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Collapsible title="Gider kategorileri" icon={PieChart} tone="red" meta={<CountPill value={formatKurusAsTL(report.expenses.totalKurus)} />}>
          <Breakdown rows={report.expenses.categories} barClass="bg-red-400" empty="Bu yıl gider kaydı yok" />
        </Collapsible>
        <Collapsible title="Gelir kategorileri" icon={PieChart} tone="green" meta={<CountPill value={formatKurusAsTL(report.incomes.totalKurus)} />}>
          <Breakdown rows={report.incomes.categories} barClass="bg-green-500" empty="Bu yıl gelir kaydı yok" />
        </Collapsible>
      </div>

      <div className="mt-4">
        <Collapsible title="Ödeme yöntemine göre" icon={CreditCard} tone="blue" defaultOpen={false}>
          {report.methods.length === 0 ? (
            <p className="text-sm text-neutral-400">Bu yıl kayıtlı işlem yok</p>
          ) : (
            <ul className="divide-y divide-neutral-100 text-sm">
              {report.methods.map((m) => (
                <li key={m.label} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span className="text-neutral-900">
                    {m.label} <span className="text-xs text-neutral-400">({m.count} kayıt)</span>
                  </span>
                  <span className="tabular-nums">
                    <span className="text-green-700">+{formatKurusAsTL(m.incomeKurus)}</span>
                    <span className="mx-2 text-neutral-300">/</span>
                    <span className="text-red-700">−{formatKurusAsTL(m.expenseKurus)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Collapsible>
      </div>
    </>
  );
}

async function AllYearsView() {
  const years = await yearsOverview();
  const max = Math.max(1, ...years.map((y) => Math.max(y.incomeKurus, y.expenseKurus)));

  return (
    <div className="mt-5">
      <Collapsible title="Yıllara göre karşılaştırma" icon={CalendarRange} meta={<CountPill value={`${years.length} yıl`} />}>
        {years.length === 0 ? (
          <p className="text-sm text-neutral-400">Henüz kayıtlı işlem yok</p>
        ) : (
          <ul className="space-y-5">
            {years.map((y) => (
              <li key={y.year}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/finance?view=year&year=${y.year}`} className="text-base font-semibold text-neutral-900 hover:underline">
                    {y.year}
                  </Link>
                  <span className="text-sm tabular-nums text-neutral-500">
                    Net{" "}
                    <span className={`font-semibold ${y.netKurus < 0 ? "text-red-700" : "text-neutral-900"}`}>{formatKurusAsTL(y.netKurus)}</span>
                    <span className="ml-2 text-xs">({y.count} kayıt)</span>
                  </span>
                </div>
                <div className="mt-2 space-y-1.5">
                  {[
                    { label: "Gelir", value: y.incomeKurus, bar: "bg-green-500", text: "text-green-700" },
                    { label: "Gider", value: y.expenseKurus, bar: "bg-red-400", text: "text-red-700" },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center gap-3 text-xs">
                      <span className="w-10 text-neutral-500">{row.label}</span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-neutral-100">
                        <div className={`animate-grow-x h-full rounded-full ${row.bar}`} style={{ width: `${(row.value / max) * 100}%` }} />
                      </div>
                      <span className={`w-28 text-right tabular-nums ${row.text}`}>{formatKurusAsTL(row.value)}</span>
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Collapsible>
    </div>
  );
}
