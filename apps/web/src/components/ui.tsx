import type { ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";

/**
 * Ortak görünüm parçaları: sayfa başlığı, kart, açılıp kapanan kart (akordeon), istatistik kutusu, rozet.
 * Sınıf adları tam metin (Tailwind taraması); renk tonları koyu modda globals.css ile kendiliğinden döner.
 */

export const btnPrimary =
  "inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-on-brand shadow-sm transition hover:bg-brand-700 active:scale-[0.98]";
export const btnSecondary =
  "inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50 hover:text-neutral-900 active:scale-[0.98]";

export const TONES = {
  brand: "bg-brand-50 text-brand-600",
  green: "bg-green-50 text-green-600",
  red: "bg-red-50 text-red-600",
  blue: "bg-blue-50 text-blue-600",
  amber: "bg-amber-50 text-amber-600",
  purple: "bg-purple-50 text-purple-600",
  neutral: "bg-neutral-100 text-neutral-600",
} as const;
export type Tone = keyof typeof TONES;

export function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <span className="mt-0.5 hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-on-brand shadow-sm sm:flex">
            <Icon className="h-5 w-5" aria-hidden />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-sm text-neutral-500">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 print:hidden">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-neutral-200 bg-white shadow-sm transition-shadow hover:shadow-md ${className}`}>
      {children}
    </section>
  );
}

function IconBadge({ icon: Icon, tone }: { icon: LucideIcon; tone: Tone }) {
  return (
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${TONES[tone]}`}>
      <Icon className="h-4 w-4" aria-hidden />
    </span>
  );
}

/**
 * Açılıp kapanan kart (akordeon). Tarayıcının <details> öğesi: JavaScript gerekmez, klavyeyle çalışır,
 * açılış/kapanış globals.css'teki geçişle yumuşar.
 */
export function Collapsible({
  title,
  icon,
  tone = "brand",
  meta,
  defaultOpen = true,
  alert,
  children,
}: {
  title: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  /** Başlığın sağında (ör. sayaç, toplam). */
  meta?: ReactNode;
  defaultOpen?: boolean;
  alert?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className={`collapsible group rounded-2xl border bg-white shadow-sm transition-shadow hover:shadow-md ${
        alert ? "border-red-200" : "border-neutral-200"
      }`}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl px-5 py-4 select-none [&::-webkit-details-marker]:hidden">
        {icon && <IconBadge icon={icon} tone={alert ? "red" : tone} />}
        <span className="min-w-0 flex-1 text-sm font-semibold text-neutral-900">{title}</span>
        {meta}
        <ChevronDown
          className="h-4 w-4 shrink-0 text-neutral-400 transition-transform duration-200 group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="px-5 pb-5">{children}</div>
    </details>
  );
}

export function CountPill({ value, alert }: { value: ReactNode; alert?: boolean }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${alert ? "bg-red-50 text-red-700" : "bg-neutral-100 text-neutral-600"}`}>
      {value}
    </span>
  );
}

/** Renkli istatistik kutusu: tonlu ikon, etiket, değer ve isteğe bağlı alt yazı. */
export function StatCard({
  label,
  value,
  icon: Icon,
  tone,
  valueClass = "text-neutral-900",
  hint,
}: {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  tone: Tone;
  valueClass?: string;
  hint?: ReactNode;
}) {
  return (
    <div className="group flex items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition group-hover:scale-105 ${TONES[tone]}`}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
        <p className={`mt-0.5 truncate text-xl font-semibold tabular-nums ${valueClass}`}>{value}</p>
        {hint && <p className="mt-0.5 truncate text-xs text-neutral-400">{hint}</p>}
      </div>
    </div>
  );
}

/** Sekmeli geçiş (bağlantılarla): Aylık / Yıllık gibi görünümler. */
export function Tabs({ items }: { items: { href: string; label: string; active: boolean }[] }) {
  return (
    <nav className="inline-flex rounded-xl bg-neutral-100 p-1 print:hidden">
      {items.map((t) => (
        <a
          key={t.href}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={`rounded-lg px-3.5 py-1.5 text-sm transition ${
            t.active ? "bg-white font-medium text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-900"
          }`}
        >
          {t.label}
        </a>
      ))}
    </nav>
  );
}
