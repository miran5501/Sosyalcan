import Link from "next/link";
import type { Role } from "@prisma/client";
import { auth } from "@/auth";
import { Nav } from "@/components/nav";
import { anchorParam, parseAnchor, parseView, rangeFor, shiftAnchor, type CalendarView } from "@/lib/calendar";
import { localDayKey } from "@/lib/datetime";
import { MONTH_NAMES } from "@/lib/labels";
import { formatKurusAsTL } from "@/lib/money";
import { FINANCE_VIEW_ROLES } from "@/lib/roles";
import { listAppointments } from "@/lib/services/appointment-service";
import { listPaymentDues } from "@/lib/services/calendar-service";
import { listShoots } from "@/lib/services/shoot-service";
import { listTasks } from "@/lib/services/task-service";
import { CalendarChip, CalendarDay, CalendarDnd } from "@/components/calendar-dnd";

const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const VIEW_LABELS: Record<CalendarView, string> = { month: "Ay", week: "Hafta", day: "Gün" };

type CalendarEvent = {
  label: string;
  type: "task" | "shoot" | "appointment" | "payment";
  href: string;
  at?: Date; // saati olan etkinlikler (çekim, randevu)
  className?: string; // türün varsayılan rengini geçersiz kılar (ödeme durumları)
  move?: { kind: "task" | "shoot" | "appointment"; id: string }; // sürükle-bırakla taşınabilir kayıtlar
};

const TYPE_STYLES: Record<CalendarEvent["type"], string> = {
  task: "bg-amber-50 text-amber-700",
  shoot: "bg-blue-50 text-blue-700",
  appointment: "bg-violet-50 text-violet-700",
  payment: "bg-rose-50 text-rose-700",
};

const timeOf = (d: Date) => d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

function periodTitle(view: CalendarView, start: Date, end: Date, anchor: Date) {
  if (view === "month") return `${MONTH_NAMES[anchor.getMonth()]} ${anchor.getFullYear()}`;
  if (view === "day") {
    return anchor.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", weekday: "long" });
  }
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);
  const first = `${start.getDate()}${start.getMonth() !== last.getMonth() ? ` ${MONTH_NAMES[start.getMonth()]}` : ""}`;
  return `${first} – ${last.getDate()} ${MONTH_NAMES[last.getMonth()]} ${last.getFullYear()}`;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string; month?: string }>;
}) {
  const session = await auth();
  const user = session!.user;
  const canManage = user.role === "ADMIN" || user.role === "OPERATIONS";
  // Operasyon finans verisini göremez: ödeme vadeleri onun takviminde yer almaz.
  const canSeeFinance = FINANCE_VIEW_ROLES.includes(user.role as Role);

  const params = await searchParams;
  const view = parseView(params.view);
  const anchor = parseAnchor(params);
  const { start, end } = rangeFor(view, anchor);
  const lastMoment = new Date(end.getTime() - 1);

  const [tasks, shoots, appointments, dues] = await Promise.all([
    listTasks(),
    listShoots({ from: start, to: lastMoment }),
    listAppointments({ from: start, to: lastMoment }),
    canSeeFinance ? listPaymentDues(start, end) : Promise.resolve([]),
  ]);

  const eventsByDay = new Map<string, CalendarEvent[]>();
  function addEvent(date: Date, event: CalendarEvent) {
    const key = localDayKey(date);
    if (!eventsByDay.has(key)) eventsByDay.set(key, []);
    eventsByDay.get(key)!.push(event);
  }

  for (const t of tasks) {
    if (t.dueDate && t.dueDate >= start && t.dueDate < end) {
      addEvent(t.dueDate, { label: `Görev: ${t.title}`, type: "task", href: `/tasks/${t.id}/edit`, move: { kind: "task", id: t.id } });
    }
  }
  for (const s of shoots) {
    addEvent(s.scheduledAt, {
      label: `Çekim: ${s.type.label}${s.customer ? ` · ${s.customer.name}` : ""}`,
      type: "shoot",
      href: `/shoots/${s.id}/edit`,
      at: s.scheduledAt,
      move: { kind: "shoot", id: s.id },
    });
  }
  for (const a of appointments) {
    const who = a.participants.map((p) => p.name).join(", ");
    addEvent(a.startsAt, {
      label: `Randevu: ${a.title}${who ? ` (${who})` : ""}`,
      type: "appointment",
      href: `/calendar/${a.id}/edit`,
      at: a.startsAt,
      move: { kind: "appointment", id: a.id },
    });
  }

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  for (const due of dues) {
    const overdue = due.status === "PENDING" && due.dueDate < todayStart;
    const className =
      due.status === "PAID"
        ? "bg-green-50 text-green-700"
        : due.status === "PLANNED"
          ? "border border-dashed border-rose-200 bg-white text-rose-400"
          : overdue
            ? "bg-red-100 text-red-800"
            : undefined;
    const statusNote = due.status === "PAID" ? " (ödendi)" : due.status === "PLANNED" ? " (planlı)" : overdue ? " (gecikti)" : "";
    addEvent(due.dueDate, {
      label: `Ödeme: ${due.customerName} · ${formatKurusAsTL(due.amountKurus)}${statusNote}`,
      type: "payment",
      href: "/payment-plans",
      className,
    });
  }

  // Aynı gün içinde saatlileri saate göre, saatsizleri (görev, ödeme) başa koy.
  for (const events of eventsByDay.values()) {
    events.sort((a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0) || a.label.localeCompare(b.label, "tr"));
  }

  const href = (v: CalendarView, date: Date) => `/calendar?view=${v}&date=${anchorParam(date)}`;
  const todayKey = localDayKey(today);

  const chip = (e: CalendarEvent, idx: number, extra = "") => (
    <CalendarChip
      key={idx}
      href={e.href}
      title={e.label}
      move={e.move}
      className={`block truncate rounded px-1 py-0.5 ${extra} ${e.className ?? TYPE_STYLES[e.type]}`}
    >
      {e.at ? `${timeOf(e.at)} ` : ""}
      {e.label}
    </CalendarChip>
  );

  // Ay ızgarası: Pazartesi başlangıçlı
  const monthCells: (Date | null)[] = [];
  if (view === "month") {
    const first = start;
    const firstWeekday = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(end.getFullYear(), end.getMonth(), 0).getDate();
    monthCells.push(...Array.from({ length: firstWeekday }, () => null));
    monthCells.push(...Array.from({ length: daysInMonth }, (_, i) => new Date(first.getFullYear(), first.getMonth(), i + 1)));
    while (monthCells.length % 7 !== 0) monthCells.push(null);
  }
  const weekDays = view === "week" ? Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)) : [];
  const dayEvents = eventsByDay.get(localDayKey(anchor)) ?? [];

  const navButton = "rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100";

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 lg:pl-64 print:pl-0">
      <Nav userName={user.name} userRole={user.role} />
      <main className="animate-fade-up mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900">Takvim — {periodTitle(view, start, end, anchor)}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-md border border-neutral-300 text-sm">
              {(Object.keys(VIEW_LABELS) as CalendarView[]).map((v) => (
                <Link
                  key={v}
                  href={href(v, anchor)}
                  className={`px-3 py-1.5 ${v === view ? "bg-brand-600 text-on-brand" : "bg-white text-neutral-700 hover:bg-neutral-100"}`}
                >
                  {VIEW_LABELS[v]}
                </Link>
              ))}
            </div>
            <Link href={href(view, shiftAnchor(view, anchor, -1))} className={navButton}>
              ← Önceki
            </Link>
            <Link href={href(view, today)} className={navButton}>
              Bugün
            </Link>
            <Link href={href(view, shiftAnchor(view, anchor, 1))} className={navButton}>
              Sonraki →
            </Link>
            {canManage && (
              <Link
                href="/calendar/new-appointment"
                className="rounded-md bg-brand-600 px-4 py-1.5 text-sm font-medium text-on-brand hover:bg-brand-700"
              >
                + Randevu
              </Link>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-4 text-xs text-neutral-500">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-amber-400" /> Görev
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-blue-400" /> Çekim
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-violet-400" /> Randevu
          </span>
          {canSeeFinance && (
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-rose-400" /> Ödeme vadesi
            </span>
          )}
        </div>

        <CalendarDnd enabled={canManage && view !== "day"}>
        {view === "month" && (
          <div className="mt-4 grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-neutral-200 bg-neutral-200">
            {WEEKDAYS.map((w) => (
              <div key={w} className="bg-neutral-50 px-2 py-2 text-center text-xs font-medium text-neutral-500">
                {w}
              </div>
            ))}
            {monthCells.map((date, i) => {
              const key = date ? localDayKey(date) : `empty-${i}`;
              const events = date ? eventsByDay.get(key) ?? [] : [];
              const isToday = date && key === todayKey;
              return (
                <CalendarDay key={key} dayKey={date ? key : ""} className="min-h-[90px] bg-white p-1.5">
                  {date && (
                    <>
                      <Link
                        href={href("day", date)}
                        className={`text-xs ${
                          isToday
                            ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 font-medium text-on-brand"
                            : "text-neutral-500 hover:text-neutral-900"
                        }`}
                      >
                        {date.getDate()}
                      </Link>
                      <div className="mt-1 space-y-0.5">
                        {events.slice(0, 3).map((e, idx) => chip(e, idx, "text-[10px]"))}
                        {events.length > 3 && (
                          <Link href={href("day", date)} className="block text-[10px] text-neutral-400 hover:text-neutral-700">
                            +{events.length - 3} daha
                          </Link>
                        )}
                      </div>
                    </>
                  )}
                </CalendarDay>
              );
            })}
          </div>
        )}

        {view === "week" && (
          <div className="mt-4 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-neutral-200 bg-neutral-200 md:grid-cols-7">
            {weekDays.map((date, i) => {
              const key = localDayKey(date);
              const events = eventsByDay.get(key) ?? [];
              return (
                <CalendarDay key={key} dayKey={key} className="min-h-[160px] bg-white p-2">
                  <Link
                    href={href("day", date)}
                    className={`text-xs font-medium ${key === todayKey ? "text-neutral-900" : "text-neutral-500"} hover:text-neutral-900`}
                  >
                    {WEEKDAYS[i]} {date.getDate()}
                    {key === todayKey && <span className="ml-1 rounded bg-brand-600 px-1 text-[10px] text-on-brand">Bugün</span>}
                  </Link>
                  <div className="mt-2 space-y-1">
                    {events.length === 0 && <span className="text-[10px] text-neutral-300">—</span>}
                    {events.map((e, idx) => chip(e, idx, "whitespace-normal break-words text-[11px]"))}
                  </div>
                </CalendarDay>
              );
            })}
          </div>
        )}

        {view === "day" && (
          <div className="mt-4 rounded-2xl border border-neutral-200 bg-white shadow-sm p-4">
            {dayEvents.length === 0 ? (
              <p className="py-6 text-center text-sm text-neutral-400">Bu güne ait kayıt yok</p>
            ) : (
              <div className="space-y-2">{dayEvents.map((e, idx) => chip(e, idx, "whitespace-normal px-3 py-2 text-sm"))}</div>
            )}
          </div>
        )}
        </CalendarDnd>
      </main>
    </div>
  );
}
