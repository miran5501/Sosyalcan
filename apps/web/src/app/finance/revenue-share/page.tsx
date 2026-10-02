import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Nav } from "@/components/nav";
import { FINANCE_VIEW_ROLES } from "@/lib/roles";
import { calculateRevenueShare, type ShareBasis } from "@/lib/services/revenue-share-service";
import { formatKurusAsTL } from "@/lib/money";
import type { Role } from "@prisma/client";

const MONTH_NAMES = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

export default async function RevenueSharePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; basis?: string }>;
}) {
  const session = await auth();
  const user = session!.user;

  // Operasyon finans verisini hiç göremez (gereksinim dokümanı bölüm 2)
  if (!FINANCE_VIEW_ROLES.includes(user.role as Role)) {
    redirect("/");
  }

  const params = await searchParams;
  const now = new Date();
  const year = Number(params.year) || now.getFullYear();
  const month = Math.min(Math.max(Number(params.month) || now.getMonth() + 1, 1), 12);
  const basis: ShareBasis = params.basis === "gross" ? "gross" : "net";

  const result = await calculateRevenueShare(year, month, basis);
  const hasPartners = result.shares.length > 0;

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 lg:pl-64 print:pl-0">
      <Nav userName={user.name} userRole={user.role} />
      <main className="animate-fade-up mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">Gelir Dağıtımı</h1>

        <form method="get" className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-neutral-200 bg-white shadow-sm p-4">
          <div>
            <label htmlFor="month" className="block text-xs text-neutral-500">
              Ay
            </label>
            <select
              id="month"
              name="month"
              defaultValue={month}
              className="mt-1 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900"
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="year" className="block text-xs text-neutral-500">
              Yıl
            </label>
            <input
              id="year"
              name="year"
              type="number"
              defaultValue={year}
              min={2000}
              max={2100}
              className="mt-1 w-24 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900"
            />
          </div>
          <div>
            <label htmlFor="basis" className="block text-xs text-neutral-500">
              Dağıtılacak tutar
            </label>
            <select
              id="basis"
              name="basis"
              defaultValue={basis}
              className="mt-1 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900"
            >
              <option value="net">Net gelir (gelir − gider)</option>
              <option value="gross">Brüt gelir</option>
            </select>
          </div>
          <button
            type="submit"
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-on-brand hover:bg-brand-700"
          >
            Hesapla
          </button>
        </form>

        <div className="mt-6 rounded-2xl border border-neutral-200 bg-white shadow-sm p-5">
          <p className="text-xs text-neutral-500">
            {MONTH_NAMES[month - 1]} {year} · {basis === "net" ? "Net gelir" : "Brüt gelir"}
          </p>
          <p
            className={`mt-1 text-2xl font-semibold ${result.baseKurus < 0 ? "text-red-700" : "text-neutral-900"}`}
          >
            {formatKurusAsTL(result.baseKurus)}
          </p>
          {result.baseKurus <= 0 && (
            <p className="mt-2 text-sm text-neutral-500">
              Bu dönemde dağıtılacak bir gelir yok, ortaklara pay düşmüyor.
            </p>
          )}
        </div>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Ortak</th>
                <th className="px-4 py-3 font-medium">Oran</th>
                <th className="px-4 py-3 text-right font-medium">Pay</th>
              </tr>
            </thead>
            <tbody>
              {!hasPartners && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-neutral-400">
                    Tanımlı ortak yok
                  </td>
                </tr>
              )}
              {result.shares.map((s) => (
                <tr key={s.name} className="border-b border-neutral-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-neutral-900">{s.name}</td>
                  <td className="px-4 py-3 text-neutral-600">%{s.sharePercent}</td>
                  <td className="px-4 py-3 text-right font-medium text-neutral-900">{formatKurusAsTL(s.amountKurus)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between text-sm">
          <Link href="/finance" className="text-neutral-600 hover:text-neutral-900 hover:underline">
            ← Finans
          </Link>
          {user.role === "ADMIN" && (
            <Link href="/settings" className="text-neutral-600 hover:text-neutral-900 hover:underline">
              Oranları düzenle →
            </Link>
          )}
        </div>
      </main>
    </div>
  );
}
