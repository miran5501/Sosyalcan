import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { resetDb } from "@/test/db-helpers";
import { createShootSchema, updateShootSchema } from "@/lib/validations/shoot";
import {
  archiveOption,
  createOption,
  getOptionGroups,
  listOptions,
  moveOption,
  restoreOption,
  updateOption,
} from "./option-service";
import { createShoot, getShootById, updateDeliveryStatus, updateShoot } from "./shoot-service";

beforeEach(resetDb);

const at = () => new Date(Date.now() + 2 * 86_400_000).toISOString();
const labels = (items: { label: string }[]) => items.map((i) => i.label);

async function platformWithFormats(name: string, formats: string[]) {
  const platform = await createOption({ kind: "PLATFORM", label: name });
  const children = [];
  for (const f of formats) children.push(await createOption({ kind: "POST_FORMAT", label: f, parentId: platform.id }));
  return { platform, formats: children };
}

describe("başlangıç seçenekleri (eski sabit değerler)", () => {
  it("çekim türleri ve teslim durumları sıralı gelir, platform listesi boştur", async () => {
    const groups = await getOptionGroups();
    expect(labels(groups.shootTypes)).toEqual(["Video", "Drone", "Diğer"]);
    expect(labels(groups.deliveryStatuses)).toEqual(["Planlandı", "Çekildi", "Kurguda", "Teslim Edildi"]);
    expect(groups.platforms).toEqual([]);
  });
});

describe("seçenek ekleme", () => {
  it("yeni çekim türü listenin sonuna eklenir", async () => {
    await createOption({ kind: "SHOOT_TYPE", label: "  Fotoğraf  " });
    expect(labels((await getOptionGroups()).shootTypes)).toEqual(["Video", "Drone", "Diğer", "Fotoğraf"]);
  });

  it("platform altına paylaşım türleri eklenir ve platformla birlikte gruplanır", async () => {
    await platformWithFormats("Sosyal Ağ A", ["Kısa Video", "Gönderi"]);
    await platformWithFormats("Sosyal Ağ B", ["Video"]);

    const { platforms } = await getOptionGroups();

    expect(platforms.map((p) => [p.label, labels(p.formats)])).toEqual([
      ["Sosyal Ağ A", ["Kısa Video", "Gönderi"]],
      ["Sosyal Ağ B", ["Video"]],
    ]);
  });

  it("aynı listede aynı ad (büyük/küçük harf ve Türkçe İ/I farkı gözetmeden) ikinci kez eklenemez", async () => {
    await expect(createOption({ kind: "SHOOT_TYPE", label: "VİDEO" })).rejects.toMatchObject({ status: 409 });
    await expect(createOption({ kind: "SHOOT_TYPE", label: "video" })).rejects.toMatchObject({ status: 409 });
  });

  it("aynı ad farklı platformların altında kullanılabilir", async () => {
    const a = await createOption({ kind: "PLATFORM", label: "A" });
    const b = await createOption({ kind: "PLATFORM", label: "B" });
    await createOption({ kind: "POST_FORMAT", label: "Hikaye", parentId: a.id });
    await expect(createOption({ kind: "POST_FORMAT", label: "Hikaye", parentId: b.id })).resolves.toBeTruthy();
  });

  it("paylaşım türü yalnızca aktif bir platformun altına eklenir", async () => {
    await expect(createOption({ kind: "POST_FORMAT", label: "Reels" })).rejects.toMatchObject({ status: 400 });
    await expect(createOption({ kind: "POST_FORMAT", label: "Reels", parentId: "opt_type_video" })).rejects.toMatchObject({ status: 400 });

    const platform = await createOption({ kind: "PLATFORM", label: "Platform" });
    await archiveOption(platform.id);
    await expect(createOption({ kind: "POST_FORMAT", label: "Reels", parentId: platform.id })).rejects.toMatchObject({ status: 409 });
  });

  it("platform veya çekim türü bir üst seçenek alamaz", async () => {
    const platform = await createOption({ kind: "PLATFORM", label: "Platform" });
    await expect(createOption({ kind: "SHOOT_TYPE", label: "X", parentId: platform.id })).rejects.toMatchObject({ status: 400 });
  });

  it("renk yalnızca teslim durumlarında saklanır; durum renksiz eklenirse gri olur", async () => {
    const status = await createOption({ kind: "DELIVERY_STATUS", label: "Onayda", color: "purple" });
    const plain = await createOption({ kind: "DELIVERY_STATUS", label: "Arşivlendi" });
    const type = await createOption({ kind: "SHOOT_TYPE", label: "Fotoğraf", color: "red" });
    expect([status.color, plain.color, type.color]).toEqual(["purple", "neutral", null]);
  });
});

describe("seçenek düzenleme ve sıralama", () => {
  it("ad değişikliği eski çekimlerde de görünür (çekim seçeneğe kimlikle bağlı)", async () => {
    const shoot = await createShoot(createShootSchema.parse({ scheduledAt: at(), typeId: "opt_type_drone" }));
    await updateOption("opt_type_drone", { label: "Drone Çekimi" });
    expect((await getShootById(shoot.id)).type.label).toBe("Drone Çekimi");
  });

  it("yeniden adlandırmada başka bir seçeneğin adı alınamaz, kendi adı korunabilir", async () => {
    await expect(updateOption("opt_type_drone", { label: "Video" })).rejects.toMatchObject({ status: 409 });
    await expect(updateOption("opt_type_drone", { label: "drone" })).resolves.toMatchObject({ label: "drone" });
  });

  it("yukarı/aşağı taşıma sırayı değiştirir; uçlarda bir şey olmaz", async () => {
    await moveOption("opt_type_other", "up");
    expect(labels((await getOptionGroups()).shootTypes)).toEqual(["Video", "Diğer", "Drone"]);

    await moveOption("opt_type_video", "up");
    await moveOption("opt_type_drone", "down");
    expect(labels((await getOptionGroups()).shootTypes)).toEqual(["Video", "Diğer", "Drone"]);
  });

  it("paylaşım türü yalnızca kendi platformu içinde taşınır", async () => {
    const { formats } = await platformWithFormats("A", ["Bir", "İki"]);
    await platformWithFormats("B", ["Üç"]);

    await moveOption(formats[1].id, "up");

    const { platforms } = await getOptionGroups();
    expect(platforms.map((p) => labels(p.formats))).toEqual([["İki", "Bir"], ["Üç"]]);
  });
});

describe("seçenek kaldırma (arşivleme)", () => {
  it("kaldırılan seçenek listeden çıkar ama silinmez; eski çekimde görünmeye devam eder", async () => {
    const shoot = await createShoot(createShootSchema.parse({ scheduledAt: at(), typeId: "opt_type_other" }));
    await archiveOption("opt_type_other");

    expect(labels((await getOptionGroups()).shootTypes)).toEqual(["Video", "Drone"]);
    expect((await getShootById(shoot.id)).type.label).toBe("Diğer");
    expect(await prisma.optionItem.count({ where: { id: "opt_type_other" } })).toBe(1);
  });

  it("son çekim türü ve son teslim durumu kaldırılamaz", async () => {
    await archiveOption("opt_type_video");
    await archiveOption("opt_type_drone");
    await expect(archiveOption("opt_type_other")).rejects.toMatchObject({ status: 409 });

    for (const id of ["opt_status_planned", "opt_status_shot", "opt_status_editing"]) await archiveOption(id);
    await expect(archiveOption("opt_status_delivered")).rejects.toMatchObject({ status: 409 });
  });

  it("platformlar ve paylaşım türleri tamamen boşaltılabilir", async () => {
    const { platform, formats } = await platformWithFormats("A", ["Bir"]);
    await archiveOption(formats[0].id);
    await archiveOption(platform.id);
    expect((await getOptionGroups()).platforms).toEqual([]);
  });

  it("geri alınan seçenek listeye döner; platformu kaldırılmış paylaşım türü önce platform geri alınmadan dönmez", async () => {
    const { platform, formats } = await platformWithFormats("A", ["Bir"]);
    await archiveOption(formats[0].id);
    await archiveOption(platform.id);

    await expect(restoreOption(formats[0].id)).rejects.toMatchObject({ status: 409 });
    await restoreOption(platform.id);
    await restoreOption(formats[0].id);

    expect((await getOptionGroups()).platforms.map((p) => labels(p.formats))).toEqual([["Bir"]]);
  });

  it("geri alırken aynı adla yeni eklenmiş aktif bir seçenek varsa reddedilir", async () => {
    await archiveOption("opt_type_other");
    await createOption({ kind: "SHOOT_TYPE", label: "Diğer" });
    await expect(restoreOption("opt_type_other")).rejects.toMatchObject({ status: 409 });
  });

  it("kaldırılanlar yalnızca istenirse listelenir", async () => {
    await archiveOption("opt_type_other");
    expect(await listOptions({ kind: "SHOOT_TYPE" })).toHaveLength(2);
    expect(await listOptions({ kind: "SHOOT_TYPE", includeArchived: true })).toHaveLength(3);
  });
});

describe("çekimde seçenek kullanımı", () => {
  it("tür seçilmezse listenin ilk türü, durum her zaman ilk teslim durumu olur", async () => {
    await moveOption("opt_type_drone", "up");
    await moveOption("opt_status_shot", "up");

    const shoot = await createShoot(createShootSchema.parse({ scheduledAt: at() }));

    expect([shoot.type.label, shoot.deliveryStatus.label]).toEqual(["Drone", "Çekildi"]);
  });

  it("yanlış listeden, olmayan ya da kaldırılmış seçenek yeni çekimde seçilemez", async () => {
    await archiveOption("opt_type_other");
    for (const typeId of ["opt_status_shot", "yok-boyle-bir-id", "opt_type_other"]) {
      await expect(createShoot(createShootSchema.parse({ scheduledAt: at(), typeId }))).rejects.toMatchObject({ status: 400 });
    }
  });

  it("kaldırılmış tür, çekimde zaten seçiliyse düzenlemede korunabilir; başka çekime atanamaz", async () => {
    const shoot = await createShoot(createShootSchema.parse({ scheduledAt: at(), typeId: "opt_type_other" }));
    const other = await createShoot(createShootSchema.parse({ scheduledAt: at() }));
    await archiveOption("opt_type_other");

    await expect(updateShoot(shoot.id, updateShootSchema.parse({ typeId: "opt_type_other", location: "X" }))).resolves.toMatchObject({ location: "X" });
    await expect(updateShoot(other.id, updateShootSchema.parse({ typeId: "opt_type_other" }))).rejects.toMatchObject({ status: 400 });
  });

  it("teslim durumu hızlı güncellemesi yalnızca teslim durumu listesinden değer alır", async () => {
    const shoot = await createShoot(createShootSchema.parse({ scheduledAt: at() }));
    await expect(updateDeliveryStatus(shoot.id, "opt_type_video")).rejects.toMatchObject({ status: 400 });
    await expect(updateDeliveryStatus(shoot.id, "opt_status_delivered")).resolves.toMatchObject({ deliveryStatusId: "opt_status_delivered" });
  });

  it("paylaşım yerleri platform sırasına göre gruplanır (önce platform, sonra türleri kendi sırasıyla)", async () => {
    const a = await platformWithFormats("A", ["Bir", "İki"]);
    const b = await platformWithFormats("B", ["Üç"]);

    const shoot = await createShoot(
      createShootSchema.parse({
        scheduledAt: at(),
        publishTargetIds: [b.formats[0].id, a.formats[1].id, a.platform.id, a.formats[0].id],
      }),
    );

    expect(shoot.publishTargets.map((t) => (t.parent ? `${t.parent.label} · ${t.label}` : t.label))).toEqual([
      "A",
      "A · Bir",
      "A · İki",
      "B · Üç",
    ]);
    expect((await getShootById(shoot.id)).publishTargets.map((t) => t.id)).toEqual(shoot.publishTargets.map((t) => t.id));
  });

  it("paylaşım yerleri platform veya paylaşım türü olabilir, tekrarlar tek sayılır", async () => {
    const a = await platformWithFormats("A", ["Kısa Video", "Hikaye"]);
    const b = await platformWithFormats("B", []);

    const shoot = await createShoot(
      createShootSchema.parse({
        scheduledAt: at(),
        publishTargetIds: [a.formats[1].id, a.formats[0].id, b.platform.id, a.formats[0].id],
      }),
    );

    expect(shoot.publishTargets.map((t) => (t.parent ? `${t.parent.label} · ${t.label}` : t.label)).sort()).toEqual([
      "A · Hikaye",
      "A · Kısa Video",
      "B",
    ]);
    await expect(
      createShoot(createShootSchema.parse({ scheduledAt: at(), publishTargetIds: ["opt_type_video"] })),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("paylaşım yerleri güncellemede bütünüyle değişir; gönderilmezse korunur", async () => {
    const { formats } = await platformWithFormats("A", ["Bir", "İki"]);
    const shoot = await createShoot(createShootSchema.parse({ scheduledAt: at(), publishTargetIds: [formats[0].id] }));

    const kept = await updateShoot(shoot.id, updateShootSchema.parse({ location: "X" }));
    expect(labels(kept.publishTargets)).toEqual(["Bir"]);

    const replaced = await updateShoot(shoot.id, updateShootSchema.parse({ publishTargetIds: [formats[1].id] }));
    expect(labels(replaced.publishTargets)).toEqual(["İki"]);

    const cleared = await updateShoot(shoot.id, updateShootSchema.parse({ publishTargetIds: [] }));
    expect(cleared.publishTargets).toEqual([]);
  });

  it("platformu kaldırılan paylaşım türü yeni çekimde seçilemez ama eski çekimde korunur", async () => {
    const { platform, formats } = await platformWithFormats("A", ["Bir"]);
    const shoot = await createShoot(createShootSchema.parse({ scheduledAt: at(), publishTargetIds: [formats[0].id] }));
    await archiveOption(platform.id);

    await expect(createShoot(createShootSchema.parse({ scheduledAt: at(), publishTargetIds: [formats[0].id] }))).rejects.toMatchObject({
      status: 400,
    });
    const kept = await updateShoot(shoot.id, updateShootSchema.parse({ publishTargetIds: [formats[0].id] }));
    expect(labels(kept.publishTargets)).toEqual(["Bir"]);
  });
});
