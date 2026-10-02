"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  CalendarDays,
  Clapperboard,
  LayoutDashboard,
  PieChart,
  Repeat,
  Settings,
  SquareKanban,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/** `badge`: menü öğesinin yanında sayaç (ör. okunmamış bildirim). */
export type NavItem = { href: string; label: string; badge?: number };

const ICONS: Record<string, LucideIcon> = {
  "/": LayoutDashboard,
  "/customers": Users,
  "/tasks": SquareKanban,
  "/shoots": Clapperboard,
  "/calendar": CalendarDays,
  "/finance": Wallet,
  "/payment-plans": Repeat,
  "/finance/revenue-share": PieChart,
  "/settings": Settings,
  "/notifications": Bell,
};

/**
 * Bulunulan sayfaya en uzun eşleşen menü öğesini vurgular: /finance/revenue-share'de yalnızca
 * "Gelir Dağıtımı" seçili görünür, "Finans" değil. Alt sayfalar (/tasks/123/edit) üst öğeyi seçer.
 */
function activeHref(pathname: string, items: NavItem[]) {
  const matches = items.filter((i) =>
    i.href === "/" ? pathname === "/" : pathname === i.href || pathname.startsWith(`${i.href}/`),
  );
  return matches.sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;
}

/** Dikey menü (masaüstü sol menü ve telefondaki açılır menü aynı bileşeni kullanır). */
export function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = activeHref(pathname, items);
  return (
    <nav className="flex flex-col gap-0.5 text-sm" aria-label="Ana menü">
      {items.map((item) => {
        const isActive = item.href === active;
        const Icon = ICONS[item.href] ?? LayoutDashboard;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
              isActive
                ? "bg-brand-50 font-medium text-brand-700"
                : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
            }`}
          >
            <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-brand-600" : "text-neutral-400"}`} aria-hidden />
            <span className="flex-1">{item.label}</span>
            {item.badge ? (
              <span className="min-w-5 rounded-full bg-red-600 px-1.5 py-0.5 text-center text-[11px] font-semibold leading-none text-on-brand" aria-label={`${item.badge} okunmamış`}>
                {item.badge > 99 ? "99+" : item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
