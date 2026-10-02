import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { daysFromToday, resetDb } from "@/test/db-helpers";
import { createShootSchema, updateShootSchema } from "@/lib/validations/shoot";
import { createTaskSchema, updateTaskSchema } from "@/lib/validations/task";
import { getDashboard } from "./dashboard-service";
import { createTransaction } from "./finance-service";
import { archiveOption, canCreateOption, createOption, getOptionGroups, moveOption, updateOption } from "./option-service";
import { createShoot, getShootById, updateShoot } from "./shoot-service";
import { createTask, getTaskById, updateTask, updateTaskStatus } from "./task-service";

beforeEach(resetDb);

const labels = (items: { label: string }[]) => items.map((i) => i.label);
const full = (items: { label: string; parent: { label: string } | null }[]) =>
  items.map((i) => (i.parent ? `${i.parent.label} · ${i.label}` : i.label));

describe("görev durumları (Kanban sütunları)", () => {
  it("başlangıçta eski dört durum sırayla gelir; yalnızca Tamamlandı 'tamamlandı sayılır'", async () => {
    const { taskStatuses } = await getOptionGroups();
    expect(taskStatuses.map((s) => [s.label, s.isDone])).toEqual([
      ["Bekliyor", false],
      ["Kurguda", false],
      ["Revizede", false],
      ["Tamamlandı", true],
    ]);
  });

  it("yeni görev listenin ilk durumunda başlar; ilk sütun değişirse yeni görev oradan başlar", async () => {
    expect((await createTask(createTaskSchema.parse({ title: "Birinci" }))).status.label).toBe("Bekliyor");

    const brief = await createOption({ kind: "TASK_STATUS", label: "Brief Bekleniyor" });
    for (let i = 0; i < 4; i++) await moveOption(brief.id, "up");

    expect((await createTask(createTaskSchema.parse({ title: "İkinci" }))).status.label).toBe("Brief Bekleniyor");
  });

  it("admin'in eklediği sütuna görev taşınabilir; yanlış listeden kimlik reddedilir", async () => {
    const approval = await createOption({ kind: "TASK_STATUS", label: "Müşteri Onayında", color: "purple" });
    const task = await createTask(createTaskSchema.parse({ title: "Reels" }));

    const moved = await updateTaskStatus(task.id, approval.id);
    expect([moved.status.label, moved.status.color]).toEqual(["Müşteri Onayında", "purple"]);

    await expect(updateTaskStatus(task.id, "opt_status_shot")).rejects.toMatchObject({ status: 400 });
  });

  it("kaldırılan sütundaki görev o durumu korur ama başka görev o sütuna taşınamaz", async () => {
    const extra = await createOption({ kind: "TASK_STATUS", label: "Geçici" });
    const task = await createTask(createTaskSchema.parse({ title: "Görev A" }));
    const other = await createTask(createTaskSchema.parse({ title: "Görev B" }));
    await updateTaskStatus(task.id, extra.id);
    await archiveOption(extra.id);

    expect((await getTaskById(task.id)).status.label).toBe("Geçici");
    await expect(updateTask(task.id, updateTaskSchema.parse({ statusId: extra.id, title: "Görev A2" }))).resolves.toMatchObject({ title: "Görev A2" });
    await expect(updateTaskStatus(other.id, extra.id)).rejects.toMatchObject({ status: 400 });
  });

  it("son görev durumu kaldırılamaz", async () => {
    for (const id of ["opt_task_waiting", "opt_task_editing", "opt_task_revision"]) await archiveOption(id);
    await expect(archiveOption("opt_task_done")).rejects.toMatchObject({ status: 409 });
  });

  it("ana sayfa 'bugünkü görevler' admin'in 'tamamlandı sayılır' işaretine göre çalışır", async () => {
    const published = await createOption({ kind: "TASK_STATUS", label: "Yayınlandı", isDone: true });
    const today = daysFromToday(0).toISOString();
    const a = await createTask(createTaskSchema.parse({ title: "Açık iş", dueDate: today }));
    const b = await createTask(createTaskSchema.parse({ title: "Yayınlanan iş", dueDate: today }));
    await updateTaskStatus(b.id, published.id);

    expect((await getDashboard("OPERATIONS")).todayTasks.map((t) => t.title)).toEqual(["Açık iş"]);

    // İşaret kaldırılınca görev yeniden "bugünkü işler"de görünür.
    await updateOption(published.id, { isDone: false });
    expect((await getDashboard("OPERATIONS")).todayTasks.map((t) => t.title).sort()).toEqual(["Açık iş", "Yayınlanan iş"]);
    expect(a.status.isDone).toBe(false);
  });

  it("'tamamlandı' işareti ve renk yalnızca durum listelerinde saklanır", async () => {
    const type = await createOption({ kind: "SHOOT_TYPE", label: "Fotoğraf", isDone: true, color: "red" });
    expect([type.isDone, type.color]).toEqual([false, null]);
  });
});

describe("görevde paylaşım yerleri", () => {
  it("görev oluşturulurken seçilir, güncellemede gönderilmezse korunur, gönderilirse değişir", async () => {
    const platform = await createOption({ kind: "PLATFORM", label: "Sosyal Ağ" });
    const reels = await createOption({ kind: "POST_FORMAT", label: "Kısa Video", parentId: platform.id });
    const story = await createOption({ kind: "POST_FORMAT", label: "Hikaye", parentId: platform.id });

    const task = await createTask(createTaskSchema.parse({ title: "Kurgu", publishTargetIds: [story.id, reels.id] }));
    expect(full(task.publishTargets)).toEqual(["Sosyal Ağ · Kısa Video", "Sosyal Ağ · Hikaye"]);

    const kept = await updateTask(task.id, updateTaskSchema.parse({ title: "Kurgu 2" }));
    expect(full(kept.publishTargets)).toEqual(["Sosyal Ağ · Kısa Video", "Sosyal Ağ · Hikaye"]);

    const changed = await updateTask(task.id, updateTaskSchema.parse({ publishTargetIds: [platform.id] }));
    expect(full(changed.publishTargets)).toEqual(["Sosyal Ağ"]);
  });

  it("paylaşım yeri olarak başka listeden seçenek verilemez", async () => {
    await expect(createTask(createTaskSchema.parse({ title: "Görev X", publishTargetIds: ["opt_task_done"] }))).rejects.toMatchObject({ status: 400 });
  });
});

describe("ekipman listesi", () => {
  async function catalog() {
    const camera = await createOption({ kind: "EQUIPMENT_CATEGORY", label: "Kamera" });
    const sound = await createOption({ kind: "EQUIPMENT_CATEGORY", label: "Ses" });
    const a7 = await createOption({ kind: "EQUIPMENT", label: "Sony A7 IV", parentId: camera.id });
    const r6 = await createOption({ kind: "EQUIPMENT", label: "Canon R6", parentId: camera.id });
    const mic = await createOption({ kind: "EQUIPMENT", label: "Yaka mikrofonu", parentId: sound.id });
    return { camera, sound, a7, r6, mic };
  }

  it("ekipman bir kategorinin altına eklenir ve kategoriye göre gruplanır", async () => {
    await catalog();
    const { equipmentCategories } = await getOptionGroups();
    expect(equipmentCategories.map((c) => [c.label, labels(c.items)])).toEqual([
      ["Kamera", ["Sony A7 IV", "Canon R6"]],
      ["Ses", ["Yaka mikrofonu"]],
    ]);
  });

  it("ekipman kategorisiz ya da başka türün altına eklenemez; aynı kategoride aynı ad iki kez olamaz", async () => {
    const { camera } = await catalog();
    await expect(createOption({ kind: "EQUIPMENT", label: "Gimbal" })).rejects.toMatchObject({ status: 400 });
    await expect(createOption({ kind: "EQUIPMENT", label: "Gimbal", parentId: "opt_type_video" })).rejects.toMatchObject({ status: 400 });
    await expect(createOption({ kind: "EQUIPMENT", label: "sony a7 iv", parentId: camera.id })).rejects.toMatchObject({ status: 409 });
  });

  it("çekime ekipman seçilir; kategori sırasına göre gruplu döner, tekrarlar tek sayılır", async () => {
    const { a7, r6, mic } = await catalog();
    const shoot = await createShoot(
      createShootSchema.parse({ scheduledAt: daysFromToday(2).toISOString(), equipmentIds: [mic.id, r6.id, a7.id, mic.id] }),
    );
    expect(full(shoot.equipmentItems)).toEqual(["Kamera · Sony A7 IV", "Kamera · Canon R6", "Ses · Yaka mikrofonu"]);
  });

  it("ekipman güncellemede gönderilmezse korunur, gönderilirse bütünüyle değişir; ekipman notu ayrı kalır", async () => {
    const { a7, mic } = await catalog();
    const shoot = await createShoot(
      createShootSchema.parse({ scheduledAt: daysFromToday(2).toISOString(), equipmentIds: [a7.id], equipment: "Yedek batarya" }),
    );

    const kept = await updateShoot(shoot.id, updateShootSchema.parse({ location: "Stüdyo" }));
    expect([labels(kept.equipmentItems), kept.equipment]).toEqual([["Sony A7 IV"], "Yedek batarya"]);

    const changed = await updateShoot(shoot.id, updateShootSchema.parse({ equipmentIds: [mic.id] }));
    expect(labels(changed.equipmentItems)).toEqual(["Yaka mikrofonu"]);
  });

  it("ekipman yerine başka listeden seçenek ya da kaldırılmış ekipman yeni çekimde seçilemez; eski çekimde korunur", async () => {
    const { camera, a7 } = await catalog();
    const shoot = await createShoot(createShootSchema.parse({ scheduledAt: daysFromToday(2).toISOString(), equipmentIds: [a7.id] }));
    await archiveOption(camera.id);

    const at = daysFromToday(3).toISOString();
    await expect(createShoot(createShootSchema.parse({ scheduledAt: at, equipmentIds: [a7.id] }))).rejects.toMatchObject({ status: 400 });
    await expect(createShoot(createShootSchema.parse({ scheduledAt: at, equipmentIds: [camera.id] }))).rejects.toMatchObject({ status: 400 });
    expect(labels((await getShootById(shoot.id)).equipmentItems)).toEqual(["Sony A7 IV"]);
  });
});

describe("finans kategorileri", () => {
  it("kayıt yalnızca listedeki kategoriyle girilir; yazım farkı listedeki ada çevrilir", async () => {
    await createOption({ kind: "FINANCE_CATEGORY", label: "Kira" });

    const t = await createTransaction({ type: "EXPENSE", amountKurus: 1000, category: " KİRA " });
    expect(t.category).toBe("Kira");

    await expect(createTransaction({ type: "EXPENSE", amountKurus: 1000, category: "Uydurma" })).rejects.toMatchObject({ status: 400 });
    await expect(createTransaction({ type: "EXPENSE", amountKurus: 1000 })).resolves.toMatchObject({ category: null });
  });

  it("kaldırılan kategoriyle yeni kayıt girilmez; kategori yeniden adlandırılsa da eski kayıt adını korur", async () => {
    const rent = await createOption({ kind: "FINANCE_CATEGORY", label: "Kira" });
    await createTransaction({ type: "EXPENSE", amountKurus: 1000, category: "Kira" });

    await updateOption(rent.id, { label: "Ofis Kirası" });
    expect((await prisma.transaction.findFirstOrThrow()).category).toBe("Kira");

    await archiveOption(rent.id);
    await expect(createTransaction({ type: "EXPENSE", amountKurus: 1000, category: "Ofis Kirası" })).rejects.toMatchObject({ status: 400 });
  });
});

describe("formdan hızlı ekleme yetkisi", () => {
  it("ekipmanı Admin ve Operasyon, finans kategorisini Admin ve Finans ekler; diğer listeler yalnızca Admin", () => {
    const matrix = (kind: Parameters<typeof canCreateOption>[1]) =>
      (["ADMIN", "OPERATIONS", "FINANCE", "VIEWER"] as const).filter((r) => canCreateOption(r, kind));
    expect(matrix("EQUIPMENT")).toEqual(["ADMIN", "OPERATIONS"]);
    expect(matrix("EQUIPMENT_CATEGORY")).toEqual(["ADMIN", "OPERATIONS"]);
    expect(matrix("FINANCE_CATEGORY")).toEqual(["ADMIN", "FINANCE"]);
    for (const kind of ["TASK_STATUS", "SHOOT_TYPE", "DELIVERY_STATUS", "PLATFORM", "POST_FORMAT"] as const) {
      expect(matrix(kind)).toEqual(["ADMIN"]);
    }
  });
});
