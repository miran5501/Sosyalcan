import { beforeEach, describe, expect, it } from "vitest";
import { flushAuditQueue, prisma } from "@/lib/prisma";
import { audit, listAuditLogs } from "@/lib/audit";
import { resetDb } from "@/test/db-helpers";

beforeEach(resetDb);

describe("otomatik denetim kaydı (Prisma katmanı)", () => {
  it("oluşturma, güncelleme ve arşivleme kendiliğinden kayda geçer", async () => {
    const customer = await prisma.customer.create({ data: { name: "Atlas Spor" } });
    await prisma.customer.update({ where: { id: customer.id }, data: { notes: "yeni not" } });
    await prisma.customer.update({ where: { id: customer.id }, data: { archivedAt: new Date() } });
    await flushAuditQueue();

    const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: "asc" } });
    expect(logs.map((l) => [l.action, l.entity, l.entityId])).toEqual([
      ["CREATE", "Müşteri", customer.id],
      ["UPDATE", "Müşteri", customer.id],
      ["DELETE", "Müşteri", customer.id],
    ]);
    expect(logs[1].summary).toBe("Atlas Spor · değişen: notlar");
    expect(logs[1].summary).not.toContain("yeni not"); // özet satırında değer yok; değerler changes alanında
    expect(logs[1].changes).toEqual({ notes: { from: null, to: "yeni not" } });
    expect(logs[2].summary).toBe("Atlas Spor · arşivlendi");
  });

  it("okuma işlemleri ve denetim kaydının kendisi kayıt üretmez", async () => {
    await prisma.customer.findMany();
    await audit({ action: "LOGIN_FAILED", summary: "x@y.co (web)" });
    await flushAuditQueue();
    expect(await prisma.auditLog.count()).toBe(1);
  });

  it("istek dışında (seed, test) yapılan işlemde kullanıcı boş kalır", async () => {
    await prisma.customer.create({ data: { name: "Boş Kullanıcı" } });
    await flushAuditQueue();
    expect((await prisma.auditLog.findFirstOrThrow()).userId).toBeNull();
  });
});

describe("audit()", () => {
  it("var olmayan kullanıcıya bağlanamazsa kişisiz yazar, hata fırlatmaz", async () => {
    await audit({ action: "LOGIN_SUCCESS", userId: "olmayan-kullanici", ip: "1.2.3.4" });
    const log = await prisma.auditLog.findFirstOrThrow();
    expect(log).toMatchObject({ action: "LOGIN_SUCCESS", userId: null, ip: "1.2.3.4" });
  });
});

describe("listAuditLogs", () => {
  it("en yeni üstte, işleme göre süzülür ve sayfalanır", async () => {
    for (let i = 0; i < 3; i++) await audit({ action: "LOGIN_FAILED", summary: `deneme ${i}` });
    await audit({ action: "LOGOUT" });

    const failed = await listAuditLogs({ action: "LOGIN_FAILED" });
    expect(failed.total).toBe(3);
    expect(failed.items[0].summary).toBe("deneme 2");
    expect((await listAuditLogs({})).total).toBe(4);
    expect((await listAuditLogs({ page: 2 })).items).toHaveLength(0);
  });
});
