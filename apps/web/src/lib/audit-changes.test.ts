import { describe, expect, it } from "vitest";
import { MASK, computeChanges, describeChange, isAuditedOperation } from "./audit-changes";

describe("isAuditedOperation", () => {
  it("yalnızca yazma işlemleri kaydedilir", () => {
    expect(isAuditedOperation("Customer", "create", {})).toBe(true);
    expect(isAuditedOperation("Customer", "findMany", {})).toBe(false);
    expect(isAuditedOperation("Customer", "count", {})).toBe(false);
  });

  it("denetim kaydının kendisi ve token tablosu kaydedilmez", () => {
    expect(isAuditedOperation("AuditLog", "create", {})).toBe(false);
    expect(isAuditedOperation("RefreshToken", "create", {})).toBe(false);
  });

  it("girişte güncellenen son giriş zamanı gürültü yapmaz, diğer kullanıcı değişiklikleri kaydedilir", () => {
    expect(isAuditedOperation("User", "update", { data: { lastLoginAt: new Date() } })).toBe(false);
    expect(isAuditedOperation("User", "update", { data: { role: "VIEWER" } })).toBe(true);
  });
});

describe("describeChange", () => {
  it("oluşturmada kaydın adını yazar", () => {
    expect(describeChange("Customer", "create", { data: {} }, { id: "c1", name: "Atlas Spor" })).toEqual({
      action: "CREATE",
      entity: "Müşteri",
      entityId: "c1",
      summary: "Atlas Spor",
    });
  });

  it("finans kaydında tür ve tutarı TL olarak yazar", () => {
    const entry = describeChange("Transaction", "create", { data: {} }, { id: "t1", type: "EXPENSE", amount: 125050, category: "Kira" });
    expect(entry?.summary).toMatch(/^Gider .*1\.250,50.* · Kira$/);
  });

  it("güncellemede değerleri değil değişen alan adlarını yazar; şifre özeti sızmaz", () => {
    const entry = describeChange(
      "User",
      "update",
      { data: { passwordHash: "$2a$12$gizli", role: "VIEWER", updatedAt: new Date() } },
      { id: "u1", name: "Ayşe", email: "a@x.co", passwordHash: "$2a$12$gizli" },
    );
    expect(entry?.summary).toBe("Ayşe · a@x.co · değişen: şifre, rol");
    expect(JSON.stringify(entry)).not.toContain("$2a$");
  });

  it("arşivleme silme, geri alma güncelleme sayılır", () => {
    expect(describeChange("Task", "update", { data: { archivedAt: new Date() } }, { id: "t", title: "Kurgu" })).toMatchObject({
      action: "DELETE",
      summary: "Kurgu · arşivlendi",
    });
    expect(describeChange("Task", "update", { data: { archivedAt: null } }, { id: "t", title: "Kurgu" })).toMatchObject({
      action: "UPDATE",
      summary: "Kurgu · arşivden geri alındı",
    });
  });

  it("toplu işlemde sayı yazılır, hiçbir satır etkilenmediyse kayıt yazılmaz", () => {
    expect(describeChange("PaymentInstance", "updateMany", { data: { status: "OVERDUE" } }, { count: 3 })).toMatchObject({
      action: "UPDATE",
      summary: "3 kayıt · durum",
    });
    expect(describeChange("PaymentInstance", "updateMany", { data: { status: "OVERDUE" } }, { count: 0 })).toBeNull();
  });

  it("yalnızca oturum sürümü artarsa 'tüm oturumları kapatıldı' yazar", () => {
    expect(describeChange("User", "update", { data: { sessionVersion: { increment: 1 } } }, { id: "u", name: "Ali" })?.summary).toBe(
      "Ali · tüm oturumları kapatıldı",
    );
  });
});

describe("computeChanges (eski / yeni değerler)", () => {
  it("güncellemede yalnızca gerçekten değişen alanları eski → yeni olarak verir", () => {
    const before = { id: "t", title: "Kurgu", priority: "LOW", dueDate: new Date("2026-10-01T09:00:00Z"), updatedAt: new Date() };
    const after = { ...before, priority: "HIGH", dueDate: new Date("2026-10-03T09:00:00Z") };
    const changes = computeChanges("update", { data: { title: "Kurgu", priority: "HIGH", dueDate: after.dueDate, updatedAt: new Date() } }, before, after);
    expect(changes).toEqual({
      priority: { from: "LOW", to: "HIGH" },
      dueDate: { from: "2026-10-01T09:00:00.000Z", to: "2026-10-03T09:00:00.000Z" },
    });
  });

  it("şifre özetinin değeri asla yazılmaz, yalnızca değiştiği görülür", () => {
    const changes = computeChanges("update", { data: { passwordHash: "$2a$12$yeni" } }, { passwordHash: "$2a$12$eski" }, { id: "u" });
    expect(changes).toEqual({ passwordHash: { from: MASK, to: MASK } });
    expect(JSON.stringify(changes)).not.toContain("$2a$");
  });

  it("oluşturmada dolu alanları, silmede silinen kaydın alanlarını verir", () => {
    expect(computeChanges("create", { data: {} }, null, { id: "c", name: "Atlas", notes: null, tags: [], createdAt: new Date() })).toEqual({
      name: { to: "Atlas" },
    });
    expect(computeChanges("delete", { where: { id: "c" } }, { id: "c", name: "Atlas", amount: 5000 }, {})).toEqual({
      name: { from: "Atlas" },
      amount: { from: 5000 },
    });
  });

  it("ilişki listesi değişikliği değer olarak değil not olarak yazılır", () => {
    const changes = computeChanges("update", { data: { equipmentItems: { set: [{ id: "a" }] } } }, { id: "s" }, { id: "s" });
    expect(changes).toEqual({ equipmentItems: { to: "(liste güncellendi)" } });
  });

  it("sonuç select ile daraltılmışsa gönderilen düz değer kullanılır; hiçbir şey değişmediyse boş döner", () => {
    expect(computeChanges("update", { data: { role: "VIEWER" } }, { role: "FINANCE" }, { id: "u" })).toEqual({ role: { from: "FINANCE", to: "VIEWER" } });
    expect(computeChanges("update", { data: { role: "VIEWER" } }, { role: "VIEWER" }, { role: "VIEWER" })).toBeUndefined();
  });
});
