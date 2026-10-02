import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { daysFromToday, makeCustomer, makePlan, resetDb, shootDefaults, taskDefaults } from "@/test/db-helpers";
import { getDashboard } from "./dashboard-service";

beforeEach(resetDb);

/** Verilen takvim gününde vadesi olan bir ödeme örneği kurar (plan gününü ve ay/yıl'ı o günden türetir). */
async function instanceDueOn(due: Date, options: { status?: "PENDING" | "PAID"; archivedPlan?: boolean; title?: string } = {}) {
  const customer = await makeCustomer("Mavi Kırtasiye");
  const plan = await makePlan(customer.id, {
    title: options.title ?? "İçerik Paketi",
    billingDay: due.getDate(),
    monthlyAmount: 350_000,
    archivedAt: options.archivedPlan ? new Date() : undefined,
  });
  return prisma.paymentInstance.create({
    data: {
      paymentPlanId: plan.id,
      year: due.getFullYear(),
      month: due.getMonth() + 1,
      amount: 350_000,
      status: options.status ?? "PENDING",
    },
  });
}

const label = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

describe("getDashboard: rol bazlı finans görünürlüğü", () => {
  it("Operasyon rolü finans alanını hiç almaz", async () => {
    await instanceDueOn(daysFromToday(-3));
    expect((await getDashboard("OPERATIONS")).finance).toBeNull();
  });

  it.each(["ADMIN", "FINANCE", "VIEWER"] as const)("%s rolü finans alanını alır", async (role) => {
    expect((await getDashboard(role)).finance).not.toBeNull();
  });
});

describe("getDashboard: geciken ve yaklaşan ödemeler", () => {
  it("vadeye göre geciken / yaklaşan (7 gün) / uzak ayrımı yapar", async () => {
    const overdueDue = daysFromToday(-10);
    const upcomingDue = daysFromToday(3);
    await instanceDueOn(overdueDue, { title: "Geciken" });
    await instanceDueOn(upcomingDue, { title: "Yaklaşan" });
    await instanceDueOn(daysFromToday(30), { title: "Uzak" });

    const { finance } = await getDashboard("ADMIN");

    expect(finance!.overduePayments.map((p) => p.planTitle)).toEqual(["Geciken"]);
    expect(finance!.upcomingPayments.map((p) => p.planTitle)).toEqual(["Yaklaşan"]);
  });

  it("ödenmiş örnekleri ve arşivlenmiş planları uyarıya katmaz", async () => {
    await instanceDueOn(daysFromToday(-5), { status: "PAID", title: "Ödenmiş" });
    await instanceDueOn(daysFromToday(-5), { archivedPlan: true, title: "Arşivli" });

    const { finance } = await getDashboard("ADMIN");

    expect(finance!.overduePayments).toEqual([]);
  });

  it("vadeyi saat dilimsiz 'YYYY-MM-DD' takvim günü olarak döner (mobilde gün kaymasın)", async () => {
    const due = daysFromToday(-4);
    await instanceDueOn(due);

    const { finance } = await getDashboard("ADMIN");

    expect(finance!.overduePayments[0].dueDate).toBe(label(due));
  });

  it("geciken ödemeleri vadesi en eski olan başta olacak şekilde sıralar", async () => {
    await instanceDueOn(daysFromToday(-2), { title: "Yeni" });
    await instanceDueOn(daysFromToday(-20), { title: "Eski" });

    const { finance } = await getDashboard("ADMIN");

    expect(finance!.overduePayments.map((p) => p.planTitle)).toEqual(["Eski", "Yeni"]);
  });
});

describe("getDashboard: bugünün işleri ve sayaçlar", () => {
  it("yalnızca arşivlenmemiş müşterileri sayar", async () => {
    await makeCustomer("Aktif");
    await prisma.customer.create({ data: { name: "Arşivli", archivedAt: new Date() } });

    expect((await getDashboard("VIEWER")).activeCustomers).toBe(1);
  });

  it("bugün teslimi olan tamamlanmamış görevleri getirir; tamamlanan, arşivli ve başka gün olanı getirmez", async () => {
    const today = daysFromToday(0);
    await prisma.task.createMany({
      data: [
        { ...taskDefaults, title: "Bugün-Bekliyor", dueDate: today },
        { ...taskDefaults, title: "Bugün-Tamam", dueDate: today, statusId: "opt_task_done" },
        { ...taskDefaults, title: "Bugün-Arşivli", dueDate: today, archivedAt: new Date() },
        { ...taskDefaults, title: "Yarın", dueDate: daysFromToday(1) },
        { ...taskDefaults, title: "Dün", dueDate: daysFromToday(-1) },
      ],
    });

    const { todayTasks } = await getDashboard("OPERATIONS");

    expect(todayTasks.map((t) => t.title)).toEqual(["Bugün-Bekliyor"]);
  });

  it("bugünkü çekim ve randevuları getirir, başka günküleri getirmez", async () => {
    await prisma.shoot.createMany({
      data: [
        { ...shootDefaults, scheduledAt: daysFromToday(0) },
        { ...shootDefaults, typeId: "opt_type_drone", scheduledAt: daysFromToday(2) },
      ],
    });
    await prisma.appointment.createMany({
      data: [
        { title: "Bugün", startsAt: daysFromToday(0) },
        { title: "Yarın", startsAt: daysFromToday(1) },
      ],
    });

    const dashboard = await getDashboard("OPERATIONS");

    expect(dashboard.todayShoots).toHaveLength(1);
    expect(dashboard.todayAppointments.map((a) => a.title)).toEqual(["Bugün"]);
  });
});
