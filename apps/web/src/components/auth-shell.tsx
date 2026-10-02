import Link from "next/link";
import type { ReactNode } from "react";

/** Giriş, 2FA, şifremi unuttum ve sıfırlama sayfalarının ortak çerçevesi (solda tanıtım, sağda kart). */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen bg-neutral-50 lg:grid-cols-2">
      {/* Geniş ekranda tanıtım paneli; telefonda yalnızca form görünür. */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-brand-600 via-brand-700 to-[#1e1b4b] p-12 text-on-brand lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3 text-lg font-semibold">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-lg font-bold">S</span>
          SosyalCan
        </div>
        <div>
          <h2 className="max-w-md text-3xl font-semibold leading-tight">Ajansın bütün işleri tek panelde.</h2>
          <p className="mt-4 max-w-md text-base text-white/75">
            Müşteriler, görevler, çekimler, takvim ve finans. Ekip sahada telefondan, ofiste web&apos;den aynı veriyle çalışır.
          </p>
        </div>
        <p className="text-sm text-white/60">SosyalCan Komuta Merkezi · İç operasyon paneli</p>
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/10 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-brand-500/30 blur-3xl" />
      </aside>

      <div className="flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
          <span
            aria-hidden
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-lg font-bold text-on-brand lg:hidden"
          >
            S
          </span>
          <h1 className="mt-4 text-xl font-semibold text-neutral-900 lg:mt-0">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>}
          {children}
        </div>
        <Link href="/kvkk" className="mt-4 text-xs text-neutral-500 hover:text-neutral-800 hover:underline">
          KVKK Aydınlatma Metni
        </Link>
      </div>
    </div>
  );
}

export const authInputClass =
  "mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";
export const authButtonClass = "w-full rounded-lg bg-brand-600 py-2.5 text-sm font-medium text-on-brand hover:bg-brand-700";

export function Notice({ tone, children }: { tone: "error" | "success" | "info"; children: ReactNode }) {
  const styles = { error: "bg-red-50 text-red-700", success: "bg-green-50 text-green-700", info: "bg-blue-50 text-blue-700" };
  return <p className={`rounded-lg px-3 py-2 text-sm ${styles[tone]}`}>{children}</p>;
}
