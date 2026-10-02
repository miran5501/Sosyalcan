import { beforeEach, describe, expect, it } from "vitest";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { makeCustomer, makePlan, resetDb, taskDefaults } from "@/test/db-helpers";
import { createUser } from "./user-service";
import { createTask, updateTask } from "./task-service";
import { createShoot } from "./shoot-service";
import { createAppointment, updateAppointment } from "./appointment-service";
import { addTaskComment } from "./task-comment-service";
import {
  ensureDailyRemindersRan,
  getPreferences,
  listNotifications,
  markRead,
  notify,
  runDailyReminders,
  setPreferences,
} from "./notification-service";

beforeEach(resetDb);

let seq = 0;
const user = (role: Role, name: string = role) => createUser({ name, email: `${name.toLowerCase()}-${++seq}@x.co`, password: "sifre-123456", role });
const notificationsOf = (userId: string) => prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
const day = (y: number, m: number, d: number, h = 9) => new Date(y, m - 1, d, h, 0);

describe("notify", () => {
  it("bildirim oluşturur, anlık türde e-postayı (geliştirme modunda giden kutusuna) yazar; işlemi yapan kişiyi atlar", async () => {
    const a = await user("OPERATIONS", "Ayse");
    const b = await user("OPERATIONS", "Bora");
    const created = await notify({ type: "TASK_ASSIGNED", userIds: [a.id, b.id], exceptUserId: b.id, title: "Sana görev atandı: X", link: "/tasks/1/edit" });

    expect(created).toBe(1);
    expect(await notificationsOf(b.id)).toHaveLength(0);
    const [n] = await notificationsOf(a.id);
    expect(n).toMatchObject({ type: "TASK_ASSIGNED", title: "Sana görev atandı: X", readAt: null });
    expect(n.emailedAt).not.toBeNull();
    const mail = await prisma.emailMessage.findFirstOrThrow();
    expect(mail).toMatchObject({ to: a.email, subject: "Sana görev atandı: X", status: "LOGGED" });
    expect(mail.text).toContain("/tasks/1/edit");
  });

  it("ödeme bildirimleri finans verisidir: Operasyon ve Viewer hiçbir zaman almaz", async () => {
    const [admin, finance, ops, viewer] = await Promise.all([user("ADMIN"), user("FINANCE"), user("OPERATIONS"), user("VIEWER")]);
    await notify({ type: "PAYMENT_OVERDUE", userIds: [admin.id, finance.id, ops.id, viewer.id], title: "Ödeme gecikti" });
    expect(await notificationsOf(admin.id)).toHaveLength(1);
    expect(await notificationsOf(finance.id)).toHaveLength(1);
    expect(await notificationsOf(ops.id)).toHaveLength(0);
    expect(await notificationsOf(viewer.id)).toHaveLength(0);
  });

  it("aynı tekrar anahtarı ikinci bildirim üretmez; devre dışı hesaba gitmez", async () => {
    const a = await user("OPERATIONS");
    const off = await user("OPERATIONS");
    await prisma.user.update({ where: { id: off.id }, data: { disabledAt: new Date() } });
    await notify({ type: "TASK_OVERDUE", userIds: [a.id, off.id], title: "Geç", dedupeKey: "task-overdue:1" });
    await notify({ type: "TASK_OVERDUE", userIds: [a.id], title: "Geç", dedupeKey: "task-overdue:1" });
    expect(await notificationsOf(a.id)).toHaveLength(1);
    expect(await notificationsOf(off.id)).toHaveLength(0);
  });

  it("tercihler: e-posta kapalıysa e-posta gitmez; uygulama içi kapalıysa listede görünmez; ikisi kapalıysa hiç oluşmaz", async () => {
    const a = await user("OPERATIONS");
    await setPreferences(a.id, a.role, [
      { type: "TASK_ASSIGNED", inApp: true, email: false },
      { type: "SHOOT_ASSIGNED", inApp: false, email: true },
      { type: "TASK_COMMENT", inApp: false, email: false },
    ]);
    await notify({ type: "TASK_ASSIGNED", userIds: [a.id], title: "görev" });
    await notify({ type: "SHOOT_ASSIGNED", userIds: [a.id], title: "çekim" });
    await notify({ type: "TASK_COMMENT", userIds: [a.id], title: "yorum" });

    expect((await prisma.emailMessage.findMany()).map((m) => m.subject)).toEqual(["çekim"]);
    const { items, unreadCount } = await listNotifications(a.id);
    expect(items.map((n) => n.title)).toEqual(["görev"]);
    expect(unreadCount).toBe(1);
    expect(await notificationsOf(a.id)).toHaveLength(2); // yorum hiç oluşmadı
  });

  it("okundu işareti yalnızca kişinin kendi bildirimlerine uygulanır", async () => {
    const a = await user("OPERATIONS");
    const b = await user("OPERATIONS");
    await notify({ type: "TASK_ASSIGNED", userIds: [a.id, b.id], title: "x" });
    const [bn] = await notificationsOf(b.id);

    expect(await markRead(a.id, { ids: [bn.id] })).toBe(0); // başkasının bildirimi
    expect(await markRead(a.id, { all: true })).toBe(1);
    expect((await listNotifications(a.id)).unreadCount).toBe(0);
    expect((await listNotifications(b.id)).unreadCount).toBe(1);
  });

  it("tercih ekranı yalnızca rolün alabileceği türleri gösterir", async () => {
    const ops = await user("OPERATIONS");
    const fin = await user("FINANCE");
    expect((await getPreferences(ops.id, "OPERATIONS")).map((p) => p.type)).not.toContain("PAYMENT_OVERDUE");
    expect((await getPreferences(fin.id, "FINANCE")).map((p) => p.type)).toContain("PAYMENT_OVERDUE");
  });
});

describe("olaylardan gelen anlık bildirimler", () => {
  it("görev atanınca atanan kişiye gider; aynı kişiyle tekrar kaydetmek yeni bildirim üretmez; kişi değişince yenisine gider", async () => {
    const a = await user("OPERATIONS", "Ayse");
    const b = await user("OPERATIONS", "Bora");
    const task = await createTask({ title: "Reels kurgusu", priority: "MEDIUM", assigneeId: a.id });
    expect((await notificationsOf(a.id)).map((n) => n.title)).toEqual(["Sana görev atandı: Reels kurgusu"]);

    await updateTask(task.id, { title: "Reels kurgusu v2", assigneeId: a.id });
    expect(await notificationsOf(a.id)).toHaveLength(1);

    await updateTask(task.id, { assigneeId: b.id });
    expect(await notificationsOf(b.id)).toHaveLength(1);
  });

  it("çekim atanınca ve randevuya YENİ eklenen katılımcıya bildirim gider", async () => {
    const a = await user("OPERATIONS");
    const b = await user("OPERATIONS");
    await createShoot({ scheduledAt: "2026-10-10T10:00", assigneeId: a.id });
    expect((await notificationsOf(a.id))[0].type).toBe("SHOOT_ASSIGNED");

    const appt = await createAppointment({ title: "Müşteri toplantısı", startsAt: "2026-10-11T14:00", participantIds: [a.id] });
    await updateAppointment(appt.id, { participantIds: [a.id, b.id] });
    expect((await notificationsOf(a.id)).filter((n) => n.type === "APPOINTMENT_INVITED")).toHaveLength(1);
    expect((await notificationsOf(b.id)).map((n) => n.type)).toEqual(["APPOINTMENT_INVITED"]);
  });

  it("göreve yorum yazılınca görevin sahibine gider, yorumu yazan kendisiyse gitmez", async () => {
    const owner = await user("OPERATIONS", "Sahip");
    const other = await user("OPERATIONS", "Diger");
    const task = await prisma.task.create({ data: { title: "Kurgu", assigneeId: owner.id, ...taskDefaults } });

    await addTaskComment(task.id, owner.id, { body: "kendi notum" });
    expect(await notificationsOf(owner.id)).toHaveLength(0);
    await addTaskComment(task.id, other.id, { body: "Renkleri biraz açalım" });
    const [n] = await notificationsOf(owner.id);
    expect(n).toMatchObject({ type: "TASK_COMMENT", body: "Renkleri biraz açalım" });
    expect(n.title).toContain("Diger");
  });
});

describe("günlük hatırlatmalar", () => {
  const now = day(2026, 10, 15);

  it("teslimi yarın olan ve geçmiş görevler, yarınki çekim; tamamlanmış görev hatırlatılmaz", async () => {
    const a = await user("OPERATIONS");
    await prisma.task.create({ data: { title: "Yarın", assigneeId: a.id, dueDate: day(2026, 10, 16, 0), ...taskDefaults } });
    await prisma.task.create({ data: { title: "Geçti", assigneeId: a.id, dueDate: day(2026, 10, 10, 0), ...taskDefaults } });
    await prisma.task.create({ data: { title: "Bitti", assigneeId: a.id, dueDate: day(2026, 10, 10, 0), statusId: "opt_task_done" } });
    await prisma.shoot.create({ data: { scheduledAt: day(2026, 10, 16, 11), assigneeId: a.id, typeId: "opt_type_drone", deliveryStatusId: "opt_status_planned" } });

    const result = await runDailyReminders(now);

    expect(result).toMatchObject({ taskDueSoon: 1, taskOverdue: 1, shootTomorrow: 1 });
    const titles = (await notificationsOf(a.id)).map((n) => n.title);
    expect(titles).toEqual(
      expect.arrayContaining(["Görevin teslim tarihi yarın: Yarın", "Görevin teslim tarihi geçti: Geçti", expect.stringContaining("Yarın 11:00 çekim: Drone")]),
    );
    expect(titles.some((t) => t.includes("Bitti"))).toBe(false);
  });

  it("atanmamış yarınki çekim Admin ve Operasyon'a gider", async () => {
    const [admin, ops, fin] = await Promise.all([user("ADMIN"), user("OPERATIONS"), user("FINANCE")]);
    await prisma.shoot.create({ data: { scheduledAt: day(2026, 10, 16, 8), typeId: "opt_type_video", deliveryStatusId: "opt_status_planned" } });
    await runDailyReminders(now);
    expect(await notificationsOf(admin.id)).toHaveLength(1);
    expect(await notificationsOf(ops.id)).toHaveLength(1);
    expect(await notificationsOf(fin.id)).toHaveLength(0);
  });

  it("vadesi 3 gün içinde olan ve geçmiş ödemeler yalnızca Admin ve Finans'a; ödenmiş olan hatırlatılmaz", async () => {
    const [admin, fin, ops] = await Promise.all([user("ADMIN"), user("FINANCE"), user("OPERATIONS")]);
    const customer = await makeCustomer("Mavi");
    const soon = await makePlan(customer.id, { title: "Yakın", billingDay: 17 });
    const late = await makePlan(customer.id, { title: "Geç", billingDay: 5 });
    const paid = await makePlan(customer.id, { title: "Ödendi", billingDay: 1 });
    await prisma.paymentInstance.create({ data: { paymentPlanId: paid.id, year: 2026, month: 10, amount: 1000, status: "PAID", paidAt: now } });
    void soon;
    void late;

    const result = await runDailyReminders(now); // bu ayın örnekleri iş içinde oluşturulur

    // Sayılar oluşan bildirim sayısıdır: her ödeme Admin ve Finans'a ayrı ayrı gider.
    expect(result).toMatchObject({ paymentDueSoon: 2, paymentOverdue: 2 });
    expect((await notificationsOf(admin.id)).map((n) => n.type).sort()).toEqual(["PAYMENT_DUE_SOON", "PAYMENT_OVERDUE"]);
    expect(await notificationsOf(fin.id)).toHaveLength(2);
    expect(await notificationsOf(ops.id)).toHaveLength(0);
  });

  it("aynı gün iki kez çalışsa da bildirim tekrarlanmaz; e-postalar kişi başına TEK günlük özette toplanır", async () => {
    const a = await user("OPERATIONS", "Ayse");
    await prisma.task.create({ data: { title: "T1", assigneeId: a.id, dueDate: day(2026, 10, 15, 0), ...taskDefaults } });
    await prisma.task.create({ data: { title: "T2", assigneeId: a.id, dueDate: day(2026, 10, 1, 0), ...taskDefaults } });

    await runDailyReminders(now);
    await runDailyReminders(now);

    expect(await notificationsOf(a.id)).toHaveLength(2);
    const mails = await prisma.emailMessage.findMany({ where: { to: a.email } });
    expect(mails).toHaveLength(1);
    expect(mails[0].subject).toBe("SosyalCan günlük özet: 2 hatırlatma");
    expect(mails[0].text).toContain("T1");
    expect(mails[0].text).toContain("T2");
  });

  it("e-postası kapalı türler özete girmez", async () => {
    const a = await user("OPERATIONS");
    await setPreferences(a.id, a.role, [{ type: "TASK_OVERDUE", inApp: true, email: false }]);
    await prisma.task.create({ data: { title: "Geç", assigneeId: a.id, dueDate: day(2026, 10, 1, 0), ...taskDefaults } });
    await runDailyReminders(now);
    expect(await notificationsOf(a.id)).toHaveLength(1);
    expect(await prisma.emailMessage.count()).toBe(0);
  });

  it("ensureDailyRemindersRan günde bir kez çalışır; ertesi gün yeniden", async () => {
    expect(await ensureDailyRemindersRan(now)).not.toBeNull();
    expect(await ensureDailyRemindersRan(day(2026, 10, 15, 18))).toBeNull();
    expect(await ensureDailyRemindersRan(day(2026, 10, 16, 7))).not.toBeNull();
  });
});
