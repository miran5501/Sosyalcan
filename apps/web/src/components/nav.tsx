import Link from "next/link";
import { LogOut } from "lucide-react";
import { after } from "next/server";
import { auth, signOut } from "@/auth";
import { ensureDailyRemindersRan, unreadCount } from "@/lib/services/notification-service";
import { getAgencySettings } from "@/lib/services/agency-service";
import { MobileMenu } from "@/components/mobile-menu";
import { NavLinks, type NavItem } from "@/components/nav-links";
import { ThemeToggle } from "@/components/theme-toggle";
import { SearchPalette } from "@/components/search-palette";

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  OPERATIONS: "Operasyon",
  FINANCE: "Finans",
  VIEWER: "Viewer",
};

/** "Ayşe Yılmaz" → "AY"; ad yoksa "?". Türkçe büyük harf (i → İ) için tr yerel ayarı kullanılır. */
function initials(name?: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const letters = parts.length === 1 ? parts[0].slice(0, 1) : parts[0].slice(0, 1) + parts[parts.length - 1].slice(0, 1);
  return letters.toLocaleUpperCase("tr-TR");
}

/** Rolün göreceği menü öğeleri: Operasyon finans sayfalarını, Admin dışındakiler Ayarlar'ı görmez. */
function navItems(userRole?: string, unread = 0): NavItem[] {
  return [
    { href: "/", label: "Ana Sayfa" },
    { href: "/notifications", label: "Bildirimler", badge: unread },
    { href: "/customers", label: "Müşteriler" },
    { href: "/tasks", label: "Görevler" },
    { href: "/shoots", label: "Çekimler" },
    { href: "/calendar", label: "Takvim" },
    ...(userRole !== "OPERATIONS"
      ? [
          { href: "/finance", label: "Finans" },
          { href: "/payment-plans", label: "Ödeme Planları" },
          { href: "/finance/revenue-share", label: "Gelir Dağıtımı" },
        ]
      : []),
    ...(userRole === "ADMIN" ? [{ href: "/settings", label: "Ayarlar" }] : []),
  ];
}

function Brand({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  return (
    <Link href="/" className="flex min-w-0 items-center gap-2.5 text-sm font-semibold text-neutral-900">
      {logoUrl ? (
        // Logo kullanıcı tarafından verilen dış bir adres: next/image alan adı ayarı gerektirir, düz <img> yeterli.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="h-7 w-auto max-w-[110px] object-contain" />
      ) : (
        <span
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-on-brand"
        >
          {name.slice(0, 1).toLocaleUpperCase("tr-TR")}
        </span>
      )}
      <span className="line-clamp-2 leading-tight">{name}</span>
    </Link>
  );
}

/** Menünün alt kısmı: tema seçimi, oturumdaki kullanıcı ve çıkış. */
function Footer({ userName, userRole }: { userName?: string | null; userRole?: string }) {
  return (
    <div className="space-y-3">
      <ThemeToggle />
      <div className="flex items-center gap-2.5">
        <Link
          href="/account"
          title="Hesabım: şifre ve oturumlar"
          className="-m-1 flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1 hover:bg-neutral-100"
        >
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-on-brand"
          >
            {initials(userName)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-neutral-900">{userName}</span>
            <span className="block text-xs text-neutral-500">{ROLE_LABELS[userRole ?? ""] ?? userRole}</span>
          </span>
        </Link>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button
            type="submit"
            title="Çıkış"
            aria-label="Çıkış"
            className="rounded-md p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
          >
            <LogOut className="h-4 w-4" aria-hidden />
          </button>
        </form>
      </div>
    </div>
  );
}

/**
 * Uygulama menüsü: geniş ekranda soldaki sabit menü (sayfa kökleri lg:pl-64 ile yer açar),
 * dar ekranda üst çubuk + soldan açılan çekmece. Yazdırırken gizlenir.
 */
export async function Nav({ userName, userRole }: { userName?: string | null; userRole?: string }) {
  const session = await auth();
  const [agency, unread] = await Promise.all([
    getAgencySettings(),
    session?.user ? unreadCount(session.user.id) : Promise.resolve(0),
  ]);
  // Günlük hatırlatmalar bugün çalışmadıysa sayfa gönderildikten sonra arka planda çalışır (cron yoksa da).
  after(() => ensureDailyRemindersRan().catch((error) => console.error("[bildirim] günlük iş", error)));
  const items = navItems(userRole, unread);
  const footer = <Footer userName={userName} userRole={userRole} />;

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-neutral-200 bg-white lg:flex print:hidden">
        <div className="px-5 py-5">
          <Brand name={agency.name} logoUrl={agency.logoUrl} />
          <div className="mt-4">
            <SearchPalette />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3">
          <NavLinks items={items} />
        </div>
        <div className="border-t border-neutral-200 p-4">{footer}</div>
      </aside>

      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-neutral-200 bg-white/90 px-3 py-2.5 backdrop-blur lg:hidden print:hidden">
        <MobileMenu items={items} footer={footer} />
        <Brand name={agency.name} logoUrl={agency.logoUrl} />
        <div className="ml-auto">
          <SearchPalette compact />
        </div>
      </header>
    </>
  );
}
