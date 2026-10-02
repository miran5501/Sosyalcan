import { ApiError } from "@/lib/api-error";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { appUrl, sendEmail } from "@/lib/email";
import { localDayKey } from "@/lib/datetime";
import { paymentDueDate } from "@/lib/calendar";
import { formatKurusAsTL } from "@/lib/money";
import { NOTIFICATION_TYPES, NOTIFICATION_TYPE_KEYS, type NotificationType, typeAllowedForRole } from "@/lib/notification-types";
import { generateMonthlyInstances } from "@/lib/services/payment-plan-service";

/**
 * Bildirimler.
 *
 * Bir bildirim her zaman veritabanına yazılır (tekrar engelleme ve günlük özet için); kişinin
 * tercihine göre zil simgesinde gösterilir (uygulama içi) ve/veya e-postayla gider.
 * Bildirim üretmek asıl işlemi asla bozmaz: hatalar loglanır, işlem devam eder.
 */

export type NotifyInput = {
  type: NotificationType;
  userIds: (string | null | undefined)[];
  title: string;
  body?: string;
  link?: string;
  /** Aynı anahtarla aynı kişiye ikinci bildirim oluşmaz (ör. "task-overdue:<id>"). */
  dedupeKey?: string;
  /** İşlemi yapan kişi kendi yaptığı işin bildirimini almaz. */
  exceptUserId?: string | null;
};

type Pref = { inApp: boolean; email: boolean };
const DEFAULT_PREF: Pref = { inApp: true, email: true };

async function preferencesFor(userIds: string[], type: NotificationType) {
  const rows = await prisma.notificationPreference.findMany({ where: { userId: { in: userIds }, type } });
  return new Map(rows.map((r) => [r.userId, { inApp: r.inApp, email: r.email }]));
}

function emailText(title: string, body: string | undefined, link: string | undefined) {
  return [title, body, link ? `\nAç: ${appUrl(link)}` : null, `\nBildirim ayarların: ${appUrl("/account")}`].filter(Boolean).join("\n");
}

/** Bildirim oluşturur; anlık türlerde e-postayı da hemen gönderir. Oluşan bildirim sayısını döner. */
export async function notify(input: NotifyInput): Promise<number> {
  try {
    const ids = [...new Set(input.userIds.filter((id): id is string => Boolean(id) && id !== input.exceptUserId))];
    if (ids.length === 0) return 0;
    const users = await prisma.user.findMany({ where: { id: { in: ids }, disabledAt: null }, select: { id: true, email: true, role: true } });
    const prefs = await preferencesFor(ids, input.type);
    const instant = NOTIFICATION_TYPES[input.type].delivery === "instant";
    let created = 0;

    for (const user of users) {
      if (!typeAllowedForRole(input.type, user.role)) continue; // ör. ödeme bildirimi Operasyon'a gitmez
      const pref = prefs.get(user.id) ?? DEFAULT_PREF;
      if (!pref.inApp && !pref.email) continue;
      try {
        const notification = await prisma.notification.create({
          data: { userId: user.id, type: input.type, title: input.title, body: input.body, link: input.link, dedupeKey: input.dedupeKey },
        });
        created += 1;
        if (instant && pref.email) {
          await sendEmail({ to: user.email, subject: input.title, text: emailText(input.title, input.body, input.link) });
          await prisma.notification.update({ where: { id: notification.id }, data: { emailedAt: new Date() } });
        }
      } catch (error) {
        // Aynı dedupeKey: bu hatırlatma bu kişiye zaten gitmiş, sessizce geç.
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
      }
    }
    return created;
  } catch (error) {
    console.error("[bildirim] oluşturulamadı", error);
    return 0;
  }
}

/** Kişinin "uygulama içi" kapattığı türler (listede ve zil sayısında gösterilmez). */
async function hiddenTypes(userId: string) {
  const rows = await prisma.notificationPreference.findMany({ where: { userId, inApp: false }, select: { type: true } });
  return rows.map((r) => r.type);
}

export async function listNotifications(userId: string, options: { unreadOnly?: boolean; limit?: number } = {}) {
  const hidden = await hiddenTypes(userId);
  const where = { userId, dismissedAt: null, type: { notIn: hidden }, ...(options.unreadOnly ? { readAt: null } : {}) };
  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: options.limit ?? 50,
      select: { id: true, type: true, title: true, body: true, link: true, readAt: true, createdAt: true },
    }),
    prisma.notification.count({ where: { userId, dismissedAt: null, type: { notIn: hidden }, readAt: null } }),
  ]);
  return { items, unreadCount };
}

export async function unreadCount(userId: string) {
  const hidden = await hiddenTypes(userId);
  return prisma.notification.count({ where: { userId, dismissedAt: null, type: { notIn: hidden }, readAt: null } });
}

/**
 * Bildirimi listeden kaldırır (çarpı). Yalnızca kişinin kendi bildirimi; başkasınınki 404.
 * Satır silinmez, "kaldırıldı" işaretlenir: aynı hatırlatma (ör. "teslim tarihi geçti") ertesi gün yeniden oluşmasın.
 * Kalıcı silme saklama süresi dolunca otomatik temizlikte olur.
 */
export async function dismissNotification(userId: string, id: string) {
  const { count } = await prisma.notification.updateMany({
    where: { id, userId, dismissedAt: null },
    data: { dismissedAt: new Date(), readAt: new Date() },
  });
  if (count === 0) throw new ApiError(404, "Bildirim bulunamadı");
}

/** Okundu işaretler: yalnızca kişinin kendi bildirimleri (başkasının kimliği verilse de etkilenmez). */
export async function markRead(userId: string, target: { ids?: string[]; all?: boolean }) {
  const { count } = await prisma.notification.updateMany({
    where: { userId, readAt: null, ...(target.all ? {} : { id: { in: target.ids ?? [] } }) },
    data: { readAt: new Date() },
  });
  return count;
}

/** Tercihler: rolün alabileceği her tür için (satır yoksa varsayılan açık). */
export async function getPreferences(userId: string, role: string) {
  const rows = await prisma.notificationPreference.findMany({ where: { userId } });
  const byType = new Map(rows.map((r) => [r.type, r]));
  return NOTIFICATION_TYPE_KEYS.filter((t) => typeAllowedForRole(t, role)).map((type) => ({
    type,
    label: NOTIFICATION_TYPES[type].label,
    delivery: NOTIFICATION_TYPES[type].delivery,
    inApp: byType.get(type)?.inApp ?? true,
    email: byType.get(type)?.email ?? true,
  }));
}

export async function setPreferences(userId: string, role: string, prefs: { type: NotificationType; inApp: boolean; email: boolean }[]) {
  const allowed = prefs.filter((p) => typeAllowedForRole(p.type, role));
  await prisma.$transaction(
    allowed.map((p) =>
      prisma.notificationPreference.upsert({
        where: { userId_type: { userId, type: p.type } },
        create: { userId, type: p.type, inApp: p.inApp, email: p.email },
        update: { inApp: p.inApp, email: p.email },
      }),
    ),
  );
  return getPreferences(userId, role);
}

// ---------------------------------------------------------------------------------------------
// Günlük hatırlatmalar
// ---------------------------------------------------------------------------------------------

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const fmtDay = (d: Date) => d.toLocaleDateString("tr-TR", { day: "numeric", month: "long" });

async function activeUserIds(roles: ("ADMIN" | "OPERATIONS" | "FINANCE" | "VIEWER")[]) {
  const users = await prisma.user.findMany({ where: { role: { in: roles }, disabledAt: null }, select: { id: true } });
  return users.map((u) => u.id);
}

/**
 * Günde bir kez: teslim tarihi bugün/yarın olan ve geçmiş görevler, yarınki çekimler, vadesi
 * yaklaşan (3 gün) ve geçmiş müşteri ödemeleri. Tekrar engelleme anahtarları sayesinde aynı gün
 * ikinci kez çalışsa da aynı bildirim iki kez oluşmaz. Sonunda günlük özet e-postaları gönderilir.
 */
export async function runDailyReminders(now: Date = new Date()) {
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  const result = { taskDueSoon: 0, taskOverdue: 0, shootTomorrow: 0, paymentDueSoon: 0, paymentOverdue: 0, digests: 0 };

  // Bu ayın ödeme örnekleri yoksa önce oluştur (cron'un çalışmadığı ortamda da hatırlatma eksik kalmasın).
  await generateMonthlyInstances(now);

  const doneStatusIds = (await prisma.optionItem.findMany({ where: { kind: "TASK_STATUS", isDone: true }, select: { id: true } })).map((o) => o.id);
  const openTask = { archivedAt: null, assigneeId: { not: null }, statusId: { notIn: doneStatusIds } };

  const dueSoon = await prisma.task.findMany({
    where: { ...openTask, dueDate: { gte: today, lt: addDays(today, 2) } },
    select: { id: true, title: true, dueDate: true, assigneeId: true },
  });
  for (const t of dueSoon) {
    const when = t.dueDate! < tomorrow ? "bugün" : "yarın";
    result.taskDueSoon += await notify({
      type: "TASK_DUE_SOON",
      userIds: [t.assigneeId],
      title: `Görevin teslim tarihi ${when}: ${t.title}`,
      link: `/tasks/${t.id}/edit`,
      dedupeKey: `task-due:${t.id}:${localDayKey(t.dueDate!)}`,
    });
  }

  const overdue = await prisma.task.findMany({
    where: { ...openTask, dueDate: { lt: today } },
    select: { id: true, title: true, dueDate: true, assigneeId: true },
  });
  for (const t of overdue) {
    result.taskOverdue += await notify({
      type: "TASK_OVERDUE",
      userIds: [t.assigneeId],
      title: `Görevin teslim tarihi geçti: ${t.title}`,
      body: `Teslim tarihi ${fmtDay(t.dueDate!)} idi.`,
      link: `/tasks/${t.id}/edit`,
      dedupeKey: `task-overdue:${t.id}`,
    });
  }

  const shoots = await prisma.shoot.findMany({
    where: { archivedAt: null, scheduledAt: { gte: tomorrow, lt: addDays(today, 2) } },
    select: { id: true, scheduledAt: true, location: true, assigneeId: true, type: { select: { label: true } }, customer: { select: { name: true } } },
  });
  const fallbackShootRecipients = shoots.some((s) => !s.assigneeId) ? await activeUserIds(["ADMIN", "OPERATIONS"]) : [];
  for (const s of shoots) {
    const time = s.scheduledAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
    result.shootTomorrow += await notify({
      type: "SHOOT_TOMORROW",
      // Atanan kişi yoksa çekimi kimse kaçırmasın: Admin ve Operasyon ekibine gider.
      userIds: s.assigneeId ? [s.assigneeId] : fallbackShootRecipients,
      title: `Yarın ${time} çekim: ${s.type.label}${s.customer ? ` · ${s.customer.name}` : ""}`,
      body: s.location ? `Konum: ${s.location}` : undefined,
      link: `/shoots/${s.id}/edit`,
      dedupeKey: `shoot-tomorrow:${s.id}:${localDayKey(s.scheduledAt)}`,
    });
  }

  const instances = await prisma.paymentInstance.findMany({
    where: { status: { not: "PAID" }, paymentPlan: { archivedAt: null } },
    select: { id: true, year: true, month: true, amount: true, paymentPlan: { select: { id: true, title: true, billingDay: true, customer: { select: { name: true } } } } },
  });
  const financeUsers = instances.length ? await activeUserIds(["ADMIN", "FINANCE"]) : [];
  for (const i of instances) {
    const due = paymentDueDate(i.year, i.month, i.paymentPlan.billingDay);
    const what = `${i.paymentPlan.customer.name} · ${i.paymentPlan.title} · ${formatKurusAsTL(i.amount)}`;
    if (due < today) {
      result.paymentOverdue += await notify({
        type: "PAYMENT_OVERDUE",
        userIds: financeUsers,
        title: `Ödeme gecikti: ${what}`,
        body: `Vade ${fmtDay(due)} idi.`,
        link: `/payment-plans/${i.paymentPlan.id}`,
        dedupeKey: `payment-overdue:${i.id}`,
      });
    } else if (due < addDays(today, 4)) {
      result.paymentDueSoon += await notify({
        type: "PAYMENT_DUE_SOON",
        userIds: financeUsers,
        title: `Ödeme vadesi yaklaşıyor (${fmtDay(due)}): ${what}`,
        link: `/payment-plans/${i.paymentPlan.id}`,
        dedupeKey: `payment-due:${i.id}`,
      });
    }
  }

  result.digests = await sendDailyDigests();
  return result;
}

/** Henüz e-postası gitmemiş günlük hatırlatmaları kişi başına TEK e-postada toplar. */
export async function sendDailyDigests(): Promise<number> {
  const dailyTypes = NOTIFICATION_TYPE_KEYS.filter((t) => NOTIFICATION_TYPES[t].delivery === "daily");
  const pending = await prisma.notification.findMany({
    where: { emailedAt: null, dismissedAt: null, type: { in: dailyTypes } },
    orderBy: { createdAt: "asc" },
    select: { id: true, type: true, title: true, link: true, user: { select: { id: true, email: true, name: true, disabledAt: true } } },
  });
  const byUser = new Map<string, typeof pending>();
  for (const n of pending) byUser.set(n.user.id, [...(byUser.get(n.user.id) ?? []), n]);

  let sent = 0;
  for (const [userId, items] of byUser) {
    const optedOut = new Set(
      (await prisma.notificationPreference.findMany({ where: { userId, email: false }, select: { type: true } })).map((p) => p.type),
    );
    const toSend = items.filter((n) => !optedOut.has(n.type));
    const user = items[0].user;
    if (toSend.length > 0 && !user.disabledAt) {
      const lines = toSend.map((n) => `• ${n.title}${n.link ? `\n  ${appUrl(n.link)}` : ""}`);
      await sendEmail({
        to: user.email,
        subject: `SosyalCan günlük özet: ${toSend.length} hatırlatma`,
        text: [`Merhaba ${user.name},`, "", "Bugün dikkat etmen gerekenler:", "", ...lines, "", `Bildirim ayarların: ${appUrl("/account")}`].join("\n"),
      });
      sent += 1;
    }
    // E-postası kapalı olanlar da "işlendi" sayılır; bir dahaki özete tekrar girmez.
    await prisma.notification.updateMany({ where: { id: { in: items.map((n) => n.id) } }, data: { emailedAt: new Date() } });
  }
  return sent;
}

const DAILY_JOB = "daily-reminders";

/**
 * Günlük hatırlatmalar bugün çalışmadıysa çalıştırır (yoksa hiçbir şey yapmaz). Hem zamanlanmış
 * görevden (cron) hem de uygulama kullanılırken arka planda çağrılır: yerelde cron olmasa da
 * günün ilk sayfa açılışında hatırlatmalar oluşur. Aynı anda iki çağrı gelirse yalnızca biri çalışır.
 */
export async function ensureDailyRemindersRan(now: Date = new Date()) {
  const today = startOfDay(now);
  const row = await prisma.jobRun.findUnique({ where: { name: DAILY_JOB } });
  if (row && row.lastRunAt >= today) return null;
  try {
    if (!row) {
      await prisma.jobRun.create({ data: { name: DAILY_JOB, lastRunAt: now } });
    } else {
      const { count } = await prisma.jobRun.updateMany({ where: { name: DAILY_JOB, lastRunAt: { lt: today } }, data: { lastRunAt: now } });
      if (count === 0) return null; // başka bir istek bu arada başlattı
    }
  } catch {
    return null; // eşzamanlı oluşturma (benzersiz ad): diğeri çalıştırıyor
  }
  const result = await runDailyReminders(now);
  // KVKK saklama süreleri: süresi dolan denetim kaydı, bildirim, e-posta ve hata kayıtları silinir.
  const { runRetentionCleanup } = await import("@/lib/services/privacy-service");
  const cleanup = await runRetentionCleanup(now);
  await prisma.jobRun.update({ where: { name: DAILY_JOB }, data: { lastResult: JSON.stringify({ ...result, cleanup }) } });
  return result;
}

export async function lastDailyRun() {
  return prisma.jobRun.findUnique({ where: { name: DAILY_JOB } });
}
