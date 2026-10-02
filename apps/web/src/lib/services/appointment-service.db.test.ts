import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { daysFromToday, makeCustomer, resetDb } from "@/test/db-helpers";
import { createAppointmentSchema, updateAppointmentSchema } from "@/lib/validations/appointment";
import { createUser } from "./user-service";
import { createAppointment, getAppointmentById, listAppointments, updateAppointment } from "./appointment-service";

beforeEach(resetDb);

const user = (name: string) => createUser({ name, email: `${name.toLowerCase()}@sosyalcan.local`, password: "sifre-123456", role: "OPERATIONS" });
const startsAt = () => daysFromToday(2).toISOString();

describe("randevu katılımcıları", () => {
  it("katılımcılarla oluşturulur; yanıtta yalnızca id ve ad döner (ada göre sıralı)", async () => {
    const [zeynep, ali] = [await user("Zeynep"), await user("Ali")];

    const created = await createAppointment({ title: "Müşteri toplantısı", startsAt: startsAt(), participantIds: [zeynep.id, ali.id] });

    expect(created.participants).toEqual([
      { id: ali.id, name: "Ali" },
      { id: zeynep.id, name: "Zeynep" },
    ]);
    expect(JSON.stringify(created)).not.toContain("passwordHash");
  });

  it("katılımcısız da oluşturulur", async () => {
    const created = await createAppointment({ title: "Tek başıma", startsAt: startsAt() });
    expect(created.participants).toEqual([]);
  });

  it("aynı kişi iki kez gönderilse tek kez eklenir", async () => {
    const ali = await user("Ali");
    const created = await createAppointment({ title: "Toplantı", startsAt: startsAt(), participantIds: [ali.id, ali.id] });
    expect(created.participants).toHaveLength(1);
  });

  it("olmayan kullanıcı katılımcı olarak reddedilir (400) ve randevu oluşmaz", async () => {
    const ali = await user("Ali");
    await expect(createAppointment({ title: "Toplantı", startsAt: startsAt(), participantIds: [ali.id, "olmayan"] })).rejects.toMatchObject({ status: 400 });
    expect(await prisma.appointment.count()).toBe(0);
  });

  it("güncellemede katılımcı listesi bütünüyle değişir", async () => {
    const [ali, veli, ayse] = [await user("Ali"), await user("Veli"), await user("Ayse")];
    const a = await createAppointment({ title: "Toplantı", startsAt: startsAt(), participantIds: [ali.id, veli.id] });

    const updated = await updateAppointment(a.id, { participantIds: [veli.id, ayse.id] });

    expect(updated.participants.map((p) => p.name)).toEqual(["Ayse", "Veli"]);
  });

  it("güncellemede katılımcı listesi gönderilmezse mevcut katılımcılar korunur", async () => {
    const ali = await user("Ali");
    const a = await createAppointment({ title: "Toplantı", startsAt: startsAt(), participantIds: [ali.id] });

    const updated = await updateAppointment(a.id, { title: "Yeni başlık" });

    expect(updated.title).toBe("Yeni başlık");
    expect(updated.participants.map((p) => p.name)).toEqual(["Ali"]);
  });

  it("boş liste göndermek tüm katılımcıları kaldırır", async () => {
    const ali = await user("Ali");
    const a = await createAppointment({ title: "Toplantı", startsAt: startsAt(), participantIds: [ali.id] });

    expect((await updateAppointment(a.id, { participantIds: [] })).participants).toEqual([]);
  });

  it("liste ve tekil okuma katılımcıları ve müşteriyi içerir", async () => {
    const [ali, customer] = [await user("Ali"), await makeCustomer("Atlas")];
    const a = await createAppointment({ title: "Toplantı", startsAt: startsAt(), customerId: customer.id, participantIds: [ali.id] });

    expect((await listAppointments())[0].participants.map((p) => p.name)).toEqual(["Ali"]);
    expect((await getAppointmentById(a.id)).customer).toEqual({ id: customer.id, name: "Atlas" });
  });
});

describe("randevu şeması", () => {
  it("katılımcı listesi isteğe bağlı; en fazla 50 kişi", () => {
    expect(createAppointmentSchema.safeParse({ title: "Toplantı", startsAt: "2026-09-21T10:00" }).success).toBe(true);
    expect(createAppointmentSchema.safeParse({ title: "Toplantı", startsAt: "x", participantIds: Array(51).fill("a") }).success).toBe(false);
  });

  it("kısmi güncelleme katılımcı alanı eklemez", () => {
    expect(updateAppointmentSchema.parse({ title: "Yeni başlık" })).toEqual({ title: "Yeni başlık" });
  });
});
