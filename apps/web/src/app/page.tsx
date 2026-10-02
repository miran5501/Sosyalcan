import Link from "next/link";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { auth } from "@/auth";
import { Nav } from "@/components/nav";
import { getDashboard } from "@/lib/services/dashboard-service";
import { formatKurusAsTL } from "@/lib/money";
import { Collapsible, CountPill, StatCard, btnPrimary, btnSecondary, type Tone } from "@/components/ui";
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  Clapperboard,
  ListTodo,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

const PRIORITY_STYLES: Record<string, string> = {
  HIGH: "bg-red-50 text-red-700",
  MEDIUM: "bg-amber-50 text-amber-700",
  LOW: "bg-neutral-100 text-neutral-600",
};
const PRIORITY_LABELS: Record<string, string> = { HIGH: "Yüksek", MEDIUM: "Orta", LOW: "Düşük" };
// Satırın tamamı tıklanabilir; üzerine gelince hafif arka plan (kenar boşluğu negatif margin ile hizalı kalır).
const ROW_LINK = "-mx-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-neutral-50";

const fmtTime = (d: Date) => new Date(d).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
// Vade "YYYY-MM-DD" (saat dilimsiz takvim günü) olarak gelir.
const fmtDate = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("tr-TR", { day: "numeric", month: "long" });
};

/** Ana sayfa kartı: açılıp kapanır (akordeon), başlıkta ikon ve sayaç. */
function Card({
  title,
  count,
  alert,
  icon,
  tone = "brand",
  children,
}: {
  title: string;
  count?: number;
  /** Dikkat gerektiren kart (ör. geciken ödeme var): kırmızı çerçeve ve sayaç. */
  alert?: boolean;
  icon: LucideIcon;
  tone?: Tone;
  children: React.ReactNode;
}) {
  return (
    <Collapsible title={title} icon={icon} tone={tone} alert={alert} meta={count !== undefined ? <CountPill value={count} alert={alert} /> : undefined}>
      {children}
    </Collapsible>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-3 text-sm text-neutral-400">{text}</p>;
}

export default async function Home() {
  const session = await auth();
  const user = session!.user;
  // Girişten sonra buraya gelinir: şifresini değiştirmesi gereken kişi adres çubuğu da doğru olsun diye doğrudan Hesabım'a.
  if (user.mustChangePassword) {
    redirect("/account");
  }
  const role = user.role as Role;

  const data = await getDashboard(role);
  const canManageOps = role === "ADMIN" || role === "OPERATIONS";
  const today = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", weekday: "long" });

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 lg:pl-64 print:pl-0">
      <Nav userName={user.name} userRole={user.role} />
      <main className="animate-fade-up mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-neutral-900">Hoş geldin, {user.name}</h1>
            <p className="text-sm text-neutral-500">{today}</p>
          </div>
          {canManageOps && (
            <div className="flex flex-wrap gap-2">
              <Link
                href="/tasks/new"
                className={btnPrimary}
              >
                + Yeni Görev
              </Link>
              <Link
                href="/shoots/new"
                className={btnSecondary}
              >
                + Yeni Çekim
              </Link>
              <Link
                href="/calendar/new-appointment"
                className={btnSecondary}
              >
                + Yeni Randevu
              </Link>
              <Link
                href="/customers/new"
                className={btnSecondary}
              >
                + Yeni Müşteri
              </Link>
            </div>
          )}
        </div>

        <div className="stagger mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Aktif Müşteri" value={data.activeCustomers} icon={Users} tone="brand" />
          {data.finance ? (
            <>
              <StatCard label="Bu Ay Gelir" value={formatKurusAsTL(data.finance.summary.incomeKurus)} icon={TrendingUp} tone="green" valueClass="text-green-700" />
              <StatCard label="Bu Ay Gider" value={formatKurusAsTL(data.finance.summary.expenseKurus)} icon={TrendingDown} tone="red" valueClass="text-red-700" />
              <StatCard
                label="Net Kâr"
                value={formatKurusAsTL(data.finance.summary.netKurus)}
                icon={Wallet}
                tone={data.finance.summary.netKurus < 0 ? "red" : "blue"}
                valueClass={data.finance.summary.netKurus < 0 ? "text-red-700" : "text-neutral-900"}
              />
            </>
          ) : (
            // Operasyon finans görmez: kutular günün iş yüküyle dolar.
            <>
              <StatCard label="Bugünkü Görev" value={data.todayTasks.length} icon={ListTodo} tone="amber" />
              <StatCard label="Bugünkü Çekim" value={data.todayShoots.length} icon={Clapperboard} tone="purple" />
              <StatCard label="Bugünkü Randevu" value={data.todayAppointments.length} icon={CalendarDays} tone="blue" />
            </>
          )}
        </div>

        <div className="stagger mt-6 grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
          <Card title="Bugünkü Görevler" count={data.todayTasks.length} icon={ListTodo} tone="amber">
            {data.todayTasks.length === 0 && <Empty text="Bugün teslimi olan görev yok" />}
            <ul className="space-y-2">
              {data.todayTasks.map((t) => (
                <li key={t.id}>
                  <Link href={`/tasks/${t.id}/edit`} className={`flex items-start justify-between gap-2 ${ROW_LINK}`}>
                    <div>
                      <p className="font-medium text-neutral-900">{t.title}</p>
                      <p className="text-xs text-neutral-500">
                        {[t.customer?.name, t.assignee?.name].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${PRIORITY_STYLES[t.priority]}`}>
                      {PRIORITY_LABELS[t.priority]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="/tasks" className="mt-3 inline-block text-xs text-neutral-500 hover:text-neutral-900 hover:underline">
              Kanban&apos;a git →
            </Link>
          </Card>

          <Card title="Bugünkü Çekimler" count={data.todayShoots.length} icon={Clapperboard} tone="purple">
            {data.todayShoots.length === 0 && <Empty text="Bugün planlı çekim yok" />}
            <ul className="space-y-2">
              {data.todayShoots.map((s) => (
                <li key={s.id}>
                  <Link href={`/shoots/${s.id}/edit`} className={`block ${ROW_LINK}`}>
                    <p className="font-medium text-neutral-900">
                      {fmtTime(s.scheduledAt)} · {s.type.label}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {[s.customer?.name, s.location, s.assignee?.name].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="/shoots" className="mt-3 inline-block text-xs text-neutral-500 hover:text-neutral-900 hover:underline">
              Tüm çekimler →
            </Link>
          </Card>

          <Card title="Bugünkü Randevular" count={data.todayAppointments.length} icon={CalendarDays} tone="blue">
            {data.todayAppointments.length === 0 && <Empty text="Bugün randevu yok" />}
            <ul className="space-y-2">
              {data.todayAppointments.map((a) => (
                <li key={a.id}>
                  <Link href={`/calendar/${a.id}/edit`} className={`block ${ROW_LINK}`}>
                    <p className="font-medium text-neutral-900">
                      {fmtTime(a.startsAt)} · {a.title}
                    </p>
                    {a.customer && <p className="text-xs text-neutral-500">{a.customer.name}</p>}
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="/calendar" className="mt-3 inline-block text-xs text-neutral-500 hover:text-neutral-900 hover:underline">
              Takvime git →
            </Link>
          </Card>
        </div>

        {data.finance && (
          <div className="stagger mt-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
            <Card
              title="Geciken Ödemeler"
              icon={AlertTriangle}
              count={data.finance.overduePayments.length}
              alert={data.finance.overduePayments.length > 0}
            >
              {data.finance.overduePayments.length === 0 && <Empty text="Geciken ödeme yok" />}
              <ul className="space-y-2">
                {data.finance.overduePayments.map((p) => (
                  <li key={p.instanceId} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium text-neutral-900">{p.customerName}</p>
                      <p className="text-xs text-red-600">
                        {p.planTitle} · vade {fmtDate(p.dueDate)}
                      </p>
                    </div>
                    <span className="font-medium text-neutral-900">{formatKurusAsTL(p.amountKurus)}</span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card title="Yaklaşan Ödemeler (7 gün)" count={data.finance.upcomingPayments.length} icon={CalendarClock} tone="green">
              {data.finance.upcomingPayments.length === 0 && <Empty text="Önümüzdeki 7 günde vadesi gelen ödeme yok" />}
              <ul className="space-y-2">
                {data.finance.upcomingPayments.map((p) => (
                  <li key={p.instanceId} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium text-neutral-900">{p.customerName}</p>
                      <p className="text-xs text-neutral-500">
                        {p.planTitle} · vade {fmtDate(p.dueDate)}
                      </p>
                    </div>
                    <span className="font-medium text-neutral-900">{formatKurusAsTL(p.amountKurus)}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/payment-plans"
                className="mt-3 inline-block text-xs text-neutral-500 hover:text-neutral-900 hover:underline"
              >
                Ödeme planlarına git →
              </Link>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
