import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import writeExcelFile from "write-excel-file/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { flushAuditQueue, prisma } from "@/lib/prisma";
import { makeCustomer, resetDb, shootDefaults, taskDefaults } from "@/test/db-helpers";
import { createUser } from "./user-service";
import { deviceLabel, forgetDevice, listDevices, noteLoginDevice } from "./device-service";
import { searchAll } from "./search-service";
import { commitCustomerImport, parseCsv, previewCustomerImport } from "./customer-import-service";
import { deleteAttachment, downloadAttachment, listAttachments, uploadAttachment } from "./attachment-service";
import { getObject, storageStatus } from "@/lib/storage";
import * as mobileLogin from "@/app/api/mobile/login/route";

beforeEach(resetDb);

let seq = 0;
const newUser = (role: "ADMIN" | "OPERATIONS" | "FINANCE" | "VIEWER" = "OPERATIONS") =>
  createUser({ name: `Kişi ${++seq}`, email: `extra${seq}@x.co`, password: "sifre-123456", role });

describe("yeni cihazdan giriş uyarısı", () => {
  const CHROME_WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
  const SAFARI_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

  it("tarayıcı bilgisinden okunabilir ad", () => {
    expect(deviceLabel(CHROME_WIN, "Web")).toBe("Chrome · Windows");
    expect(deviceLabel(SAFARI_IPHONE, "Web")).toBe("Safari · iPhone · iOS 18");
    // Client Hints: Windows 11 ayrımı ve Android telefon modeli
    expect(deviceLabel(CHROME_WIN, "Web", { platform: "Windows", platformVersion: "15.0.0" })).toBe("Chrome · Windows 11");
    expect(deviceLabel(CHROME_WIN, "Web", { platform: "Windows", platformVersion: "10.0.0" })).toBe("Chrome · Windows 10");
    expect(deviceLabel("Mozilla/5.0 (Linux; Android 10; K) Chrome/140.0 Mobile Safari/537.36", "Web", { platform: "Android", platformVersion: "14.0.0", model: "SM-S918B" })).toBe(
      "Chrome · SM-S918B (Android 14)",
    );
    // Mobil uygulama telefonun marka/modelini kendisi gönderir
    expect(deviceLabel("okhttp/4.12.0", "Mobil", {}, "Samsung SM-S918B · Android 14")).toBe("Mobil uygulama · Samsung SM-S918B · Android 14");
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0) Chrome/140.0 Safari/537.36 Edg/140.0", "Web")).toBe("Edge · Windows");
    expect(deviceLabel("okhttp/4.12.0", "Mobil")).toBe("Mobil uygulama");
    expect(deviceLabel(null, "Web")).toBe("Tarayıcı");
  });

  it("ilk cihaz uyarı vermez; aynı cihaz tekrar vermez; yeni cihaz bildirim + e-posta gönderir", async () => {
    const user = await newUser();
    expect(await noteLoginDevice({ userId: user.id, deviceId: "cihaz-1", userAgent: CHROME_WIN, ip: "10.0.0.1", channel: "Web" })).toEqual({ isNew: true, alerted: false });
    expect(await noteLoginDevice({ userId: user.id, deviceId: "cihaz-1", userAgent: CHROME_WIN, ip: "10.0.0.2", channel: "Web" })).toEqual({ isNew: false, alerted: false });
    expect(await prisma.notification.count({ where: { userId: user.id } })).toBe(0);

    expect(await noteLoginDevice({ userId: user.id, deviceId: "cihaz-2", userAgent: SAFARI_IPHONE, ip: "10.0.0.9", channel: "Web" })).toEqual({ isNew: true, alerted: true });
    const notification = await prisma.notification.findFirstOrThrow({ where: { userId: user.id } });
    expect(notification).toMatchObject({ type: "NEW_DEVICE_LOGIN", link: "/account#cihazlar" });
    expect(notification.body).toContain("Safari · iPhone · iOS 18");
    expect(notification.body).not.toContain("10.0.0.9"); // IP bildirimde gösterilmez (Hesabım'daki cihaz listesinde var)
    expect(await prisma.emailMessage.count({ where: { to: user.email } })).toBe(1);

    const devices = await listDevices(user.id);
    expect(devices.map((d) => d.label).sort()).toEqual(["Chrome · Windows", "Safari · iPhone · iOS 18"]);
    expect(devices.find((d) => d.label === "Chrome · Windows")?.lastIp).toBe("10.0.0.2");
    // Ham cihaz kimliği veritabanına yazılmaz.
    expect(JSON.stringify(await prisma.knownDevice.findMany())).not.toContain("cihaz-1");
  });

  it("listeden çıkarılan cihazdan sonraki giriş yine yeni sayılır; başkasının cihazı çıkarılamaz", async () => {
    const user = await newUser();
    const other = await newUser();
    await noteLoginDevice({ userId: user.id, deviceId: "a", channel: "Web" });
    await noteLoginDevice({ userId: user.id, deviceId: "b", channel: "Web" });
    const [device] = await listDevices(user.id);
    await expect(forgetDevice(other.id, device.id)).rejects.toMatchObject({ status: 404 });
    await forgetDevice(user.id, device.id);
    expect(await listDevices(user.id)).toHaveLength(1);
  });

  it("mobil giriş: uygulamanın gönderdiği cihaz kimliği kullanılır", async () => {
    const user = await newUser();
    await noteLoginDevice({ userId: user.id, deviceId: "web-tarayici", channel: "Web" });
    const login = (deviceId: string) =>
      mobileLogin.POST(
        new NextRequest("http://localhost/api/mobile/login", {
          method: "POST",
          body: JSON.stringify({ email: user.email, password: "sifre-123456", deviceId, deviceName: "Google Pixel 6a · Android 16" }),
          headers: { "content-type": "application/json", "x-forwarded-for": "10.7.7.7", "user-agent": "okhttp/4.12.0 Android" },
        }),
      );
    expect((await login("telefon-1")).status).toBe(200);
    expect((await login("telefon-1")).status).toBe(200);
    const alerts = await prisma.notification.findMany({ where: { userId: user.id, type: "NEW_DEVICE_LOGIN" } });
    expect(alerts).toHaveLength(1); // aynı telefondan ikinci giriş uyarı üretmez
    expect(alerts[0].body).toContain("Mobil uygulama · Google Pixel 6a · Android 16");
  });
});

describe("global arama", () => {
  async function seed() {
    const customer = await prisma.customer.create({ data: { name: "Atlas Kafe", contact: "Ayşe" } });
    await prisma.customer.create({ data: { name: "Arşivli Atlas", archivedAt: new Date() } });
    await prisma.task.create({ data: { ...taskDefaults, title: "Atlas reels kurgusu", customerId: customer.id } });
    await prisma.shoot.create({ data: { ...shootDefaults, scheduledAt: new Date(), location: "Kadıköy stüdyo", customerId: customer.id } });
    await prisma.appointment.create({ data: { title: "Atlas toplantısı", startsAt: new Date() } });
    await prisma.transaction.create({ data: { type: "INCOME", amount: 100_000, description: "Atlas eylül ödemesi", occurredAt: new Date(), customerId: customer.id } });
    await prisma.paymentPlan.create({ data: { title: "Atlas paketi", customerId: customer.id, monthlyAmount: 1000, billingDay: 5 } });
  }

  it("müşteri adı geçen her kayıt bulunur, büyük/küçük harf fark etmez, arşiv gelmez", async () => {
    await seed();
    const hits = await searchAll("atlas", "ADMIN");
    const groups = hits.map((h) => h.group);
    expect(new Set(groups)).toEqual(new Set(["customers", "tasks", "shoots", "appointments", "transactions", "paymentPlans"]));
    expect(hits.filter((h) => h.group === "customers").map((h) => h.title)).toEqual(["Atlas Kafe"]);
    expect(hits.find((h) => h.group === "transactions")?.href).toMatch(/^\/finance\//);
  });

  it("Operasyon finans sonucu hiçbir koşulda almaz; Viewer alır", async () => {
    await seed();
    const ops = await searchAll("atlas", "OPERATIONS");
    expect(ops.some((h) => h.group === "transactions" || h.group === "paymentPlans")).toBe(false);
    expect(JSON.stringify(ops)).not.toContain("eylül ödemesi");
    const viewer = await searchAll("ödemesi", "VIEWER");
    expect(viewer.map((h) => h.group)).toEqual(["transactions"]);
  });

  it("çok kısa sorgu boş döner; konum gibi alanlarda da arar", async () => {
    await seed();
    expect(await searchAll("a", "ADMIN")).toEqual([]);
    expect((await searchAll("kadıköy", "VIEWER")).map((h) => h.group)).toEqual(["shoots"]);
  });
});

describe("Excel/CSV'den müşteri aktarma", () => {
  it("CSV okuyucu: ; ve , ayırıcı, tırnaklı alan, alan içinde satır sonu", () => {
    expect(parseCsv('Ad;Not\r\n"Kafe; Bar";"iki\nsatır"\r\n')).toEqual([["Ad", "Not"], ["Kafe; Bar", "iki\nsatır"]]);
    expect(parseCsv('a,b\n1,"x ""y"""')).toEqual([["a", "b"], ["1", 'x "y"']]);
  });

  it("önizleme: başlıklar tanınır, mevcut ve dosyada tekrar eden ad atlanır, hatalı satır işaretlenir; hiçbir şey kaydedilmez", async () => {
    await makeCustomer("Mevcut Kafe");
    const csv = "﻿Müşteri Adı;Telefon;E-posta;Etiketler;Notlar\r\n" + "Yeni Restoran;0532;yeni@x.co;restoran, VIP;aylık 4 reels\r\n" + "MEVCUT KAFE;;;;\r\n" + "Yeni restoran;;;;\r\n" + "X;;;;\r\n" + ";;;;\r\n";
    const preview = await previewCustomerImport(Buffer.from(csv, "utf8"), "liste.csv");
    expect(preview.counts).toEqual({ new: 1, duplicate: 2, invalid: 1 });
    expect(preview.rows[0]).toMatchObject({ line: 2, name: "Yeni Restoran", contact: "0532 · yeni@x.co", tags: ["restoran", "vip"], notes: "aylık 4 reels", status: "new" });
    expect(preview.rows[3]).toMatchObject({ line: 5, status: "invalid" });
    expect(await prisma.customer.count()).toBe(1);
  });

  it("kaydet: yalnızca yeni satırlar eklenir; aynı dosya ikinci kez yüklenince hepsi atlanır", async () => {
    const csv = "Ad,İletişim\nBir,1\nİki,2\n";
    expect(await commitCustomerImport(Buffer.from(csv), "a.csv")).toEqual({ created: 2, skipped: 0 });
    expect(await commitCustomerImport(Buffer.from(csv), "a.csv")).toEqual({ created: 0, skipped: 2 });
    expect((await prisma.customer.findMany({ orderBy: { name: "asc" } })).map((c) => c.name)).toEqual(["Bir", "İki"]);
  });

  it("Excel (.xlsx) dosyası okunur; eski Windows Türkçe kodlamalı CSV de", async () => {
    const xlsx = await writeExcelFile([
      ["Firma", "Yetkili", "Etiket"],
      ["Excel Kafe", "Mehmet", "kafe"],
      ["Sayı Ltd", 12345, ""],
    ]).toBuffer();
    const preview = await previewCustomerImport(xlsx, "musteriler.xlsx");
    expect(preview.rows.map((r) => [r.name, r.contact, r.status])).toEqual([
      ["Excel Kafe", "Mehmet", "new"],
      ["Sayı Ltd", "12345", "new"],
    ]);

    // "Ad;Not\nŞişli Ağaç;çok iyi" Windows-1254 ile: Ş=0xDE, ş=0xFE, ğ=0xF0, ç=0xE7
    const win1254 = Buffer.from([0x41, 0x64, 0x3b, 0x4e, 0x6f, 0x74, 0x0a, 0xde, 0x69, 0xfe, 0x6c, 0x69, 0x20, 0x41, 0xf0, 0x61, 0xe7, 0x3b, 0xe7, 0x6f, 0x6b]);
    expect((await previewCustomerImport(win1254, "eski.csv")).rows[0]).toMatchObject({ name: "Şişli Ağaç", notes: "çok" });
  });

  it("ad sütunu yoksa, tür desteklenmiyorsa ya da dosya boşsa anlaşılır hata", async () => {
    await expect(previewCustomerImport(Buffer.from("Telefon\n123"), "a.csv")).rejects.toMatchObject({ status: 400, message: expect.stringContaining("Ad") });
    await expect(previewCustomerImport(Buffer.from("x"), "a.xls")).rejects.toMatchObject({ status: 400 });
    await expect(previewCustomerImport(Buffer.alloc(0), "a.csv")).rejects.toMatchObject({ status: 400 });
    await expect(previewCustomerImport(Buffer.from("bozuk"), "a.xlsx")).rejects.toMatchObject({ status: 400 });
  });
});

describe("dosya ekleri (yerel depolama)", () => {
  let root: string;
  let dir: string;
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "sosyalcan-dosya-"));
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  beforeEach(() => {
    dir = mkdtempSync(join(root, "t-")); // her test boş bir klasörle başlar
    vi.stubEnv("STORAGE_DIR", dir);
    vi.stubEnv("STORAGE_DRIVER", "local");
  });
  afterEach(() => vi.unstubAllEnvs());

  const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n");
  const files = () => readdirSync(dir, { recursive: true }).filter((f) => String(f).includes("."));

  async function setup() {
    const shoot = await prisma.shoot.create({ data: { ...shootDefaults, scheduledAt: new Date() } });
    const tx = await prisma.transaction.create({ data: { type: "EXPENSE", amount: 5000, occurredAt: new Date() } });
    return { shoot, tx, ops: await newUser("OPERATIONS"), fin: await newUser("FINANCE"), viewer: await newUser("VIEWER") };
  }

  it("çekime Operasyon yükler; herkes indirir; dosya adı güvenli hâle gelir; diskte de durur", async () => {
    const { shoot, ops } = await setup();
    const created = await uploadAttachment({ kind: "shoot", id: shoot.id }, { name: "../../brief<1>.pdf", bytes: PDF }, ops);
    expect(created).toMatchObject({ fileName: "brief1.pdf", contentType: "application/pdf", size: PDF.length });
    expect(files()).toHaveLength(1);
    const { bytes, attachment } = await downloadAttachment(created.id, "VIEWER");
    expect(bytes.equals(PDF)).toBe(true);
    expect(attachment.storageKey).not.toContain("brief"); // kullanıcının verdiği ad yola girmez
    expect(await listAttachments({ kind: "shoot", id: shoot.id }, "FINANCE")).toHaveLength(1);
  });

  it("yetki: Viewer/Finans çekime ekleyemez; Operasyon finans dosyasını göremez ve ekleyemez", async () => {
    const { shoot, tx, fin, ops } = await setup();
    await expect(uploadAttachment({ kind: "shoot", id: shoot.id }, { name: "a.pdf", bytes: PDF }, fin)).rejects.toMatchObject({ status: 403 });
    await expect(uploadAttachment({ kind: "transaction", id: tx.id }, { name: "a.pdf", bytes: PDF }, ops)).rejects.toMatchObject({ status: 404 });

    const invoice = await uploadAttachment({ kind: "transaction", id: tx.id }, { name: "fatura.pdf", bytes: PDF }, fin);
    await expect(listAttachments({ kind: "transaction", id: tx.id }, "OPERATIONS")).rejects.toMatchObject({ status: 404 });
    await expect(downloadAttachment(invoice.id, "OPERATIONS")).rejects.toMatchObject({ status: 404 });
    await expect(deleteAttachment(invoice.id, "VIEWER")).rejects.toMatchObject({ status: 403 });
    expect((await downloadAttachment(invoice.id, "VIEWER")).bytes.equals(PDF)).toBe(true);
  });

  it("izinsiz tür, uzantısıyla uyuşmayan içerik, boyut ve olmayan kayıt reddedilir", async () => {
    const { shoot, ops } = await setup();
    const up = (name: string, bytes: Buffer, id = shoot.id) => uploadAttachment({ kind: "shoot", id }, { name, bytes }, ops);
    await expect(up("virus.exe", Buffer.from("MZ"))).rejects.toMatchObject({ status: 400 });
    await expect(up("sayfa.html", Buffer.from("<script>"))).rejects.toMatchObject({ status: 400 });
    await expect(up("sahte.pdf", Buffer.from("<html>"))).rejects.toMatchObject({ status: 400, message: expect.stringContaining("uyuşmuyor") });
    vi.stubEnv("UPLOAD_MAX_MB", "1");
    await expect(up("buyuk.txt", Buffer.alloc(1024 * 1024 + 1, 65))).rejects.toMatchObject({ status: 400 });
    await expect(up("a.pdf", PDF, "olmayan-cekim")).rejects.toMatchObject({ status: 404 });
    expect(files()).toHaveLength(0);
  });

  it("silince hem kayıt hem dosya gider; denetim kaydına yazılır", async () => {
    const { shoot, ops } = await setup();
    const created = await uploadAttachment({ kind: "shoot", id: shoot.id }, { name: "a.png", bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2]) }, ops);
    expect(files()).toHaveLength(1);
    await deleteAttachment(created.id, "OPERATIONS");
    expect(await prisma.attachment.count()).toBe(0);
    expect(files()).toHaveLength(0);
    await flushAuditQueue();
    expect(await prisma.auditLog.count({ where: { entityId: created.id } })).toBe(2); // ekleme + silme
  });

  it("Vercel'de depolama ayarı yoksa yükleme kapalı; S3 ayarı eksikse nedeni söylenir", async () => {
    vi.stubEnv("STORAGE_DRIVER", "");
    vi.stubEnv("VERCEL", "1");
    expect(storageStatus()).toMatchObject({ enabled: false });
    const { shoot, ops } = await setup();
    await expect(uploadAttachment({ kind: "shoot", id: shoot.id }, { name: "a.pdf", bytes: PDF }, ops)).rejects.toMatchObject({ status: 503 });
    vi.stubEnv("STORAGE_DRIVER", "s3");
    vi.stubEnv("S3_BUCKET", "kova");
    expect(storageStatus()).toMatchObject({ enabled: false, reason: expect.stringContaining("S3_ENDPOINT") });
  });
});

/**
 * S3 sürücüsü gerçek bir S3 uyumlu sunucuyla denenir; yalnızca S3_TEST_ENDPOINT verilince çalışır. Yerelde:
 *   docker run -d --name sosyalcan-minio-test -p 9100:9000 -e MINIO_ROOT_USER=sosyalcan \
 *     -e MINIO_ROOT_PASSWORD=sosyalcan-minio-test-123 minio/minio server /data
 *   S3_TEST_ENDPOINT=http://localhost:9100 npm run test:db -- extras
 */
describe.runIf(process.env.S3_TEST_ENDPOINT)("dosya ekleri (S3 uyumlu depolama)", () => {
  const bucket = `sosyalcan-test-${Date.now()}`;
  beforeAll(async () => {
    vi.stubEnv("STORAGE_DRIVER", "s3");
    vi.stubEnv("S3_ENDPOINT", process.env.S3_TEST_ENDPOINT!);
    vi.stubEnv("S3_BUCKET", bucket);
    vi.stubEnv("S3_REGION", "us-east-1");
    vi.stubEnv("S3_ACCESS_KEY_ID", process.env.S3_TEST_ACCESS_KEY ?? "sosyalcan");
    vi.stubEnv("S3_SECRET_ACCESS_KEY", process.env.S3_TEST_SECRET_KEY ?? "sosyalcan-minio-test-123");
    const { AwsClient } = await import("aws4fetch");
    const client = new AwsClient({ accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!, region: "us-east-1", service: "s3" });
    const created = await client.fetch(`${process.env.S3_TEST_ENDPOINT}/${bucket}`, { method: "PUT" });
    expect(created.ok).toBe(true);
  });
  afterAll(() => vi.unstubAllEnvs());

  it("yükle → indir → sil; Türkçe dosya adı korunur", async () => {
    expect(storageStatus()).toEqual({ enabled: true, driver: "s3" });
    const shoot = await prisma.shoot.create({ data: { ...shootDefaults, scheduledAt: new Date() } });
    const ops = await newUser("OPERATIONS");
    const bytes = Buffer.from("%PDF-1.7 çekim brief'i");
    const created = await uploadAttachment({ kind: "shoot", id: shoot.id }, { name: "Çekim planı (ekim).pdf", bytes }, ops);
    expect(created.fileName).toBe("Çekim planı (ekim).pdf");
    expect((await downloadAttachment(created.id, "VIEWER")).bytes.equals(bytes)).toBe(true);
    const { storageKey } = await prisma.attachment.findUniqueOrThrow({ where: { id: created.id } });
    await expect(getObject(storageKey)).resolves.toBeTruthy();
    await deleteAttachment(created.id, "ADMIN");
    expect(await prisma.attachment.findUnique({ where: { id: created.id } })).toBeNull();
    await expect(getObject(storageKey)).rejects.toThrow(); // depolamadan da silindi
  });
});

describe("takvimde sürükle-bırak (tarih taşıma)", () => {
  it("çekim ve randevu yeni güne taşınır, saat aynı kalır; görev son tarihi gün olarak değişir", async () => {
    const { rescheduleCalendarItem } = await import("./calendar-service");
    const shoot = await prisma.shoot.create({ data: { ...shootDefaults, scheduledAt: new Date(2026, 9, 5, 14, 30) } });
    const appointment = await prisma.appointment.create({ data: { title: "Toplantı", startsAt: new Date(2026, 9, 5, 9, 15) } });
    const task = await prisma.task.create({ data: { ...taskDefaults, title: "Kurgu", dueDate: new Date("2026-10-05T00:00:00.000Z") } });

    await rescheduleCalendarItem("shoot", shoot.id, "2026-10-09");
    await rescheduleCalendarItem("appointment", appointment.id, "2026-11-01");
    await rescheduleCalendarItem("task", task.id, "2026-10-12");

    expect((await prisma.shoot.findUniqueOrThrow({ where: { id: shoot.id } })).scheduledAt).toEqual(new Date(2026, 9, 9, 14, 30));
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).startsAt).toEqual(new Date(2026, 10, 1, 9, 15));
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).dueDate?.toISOString()).toBe("2026-10-12T00:00:00.000Z");
  });

  it("arşivlenmiş ya da olmayan kayıt, geçersiz tarih ve taşınamayan tür reddedilir", async () => {
    const { rescheduleCalendarItem } = await import("./calendar-service");
    const shoot = await prisma.shoot.create({ data: { ...shootDefaults, scheduledAt: new Date(), archivedAt: new Date() } });
    await expect(rescheduleCalendarItem("shoot", shoot.id, "2026-10-09")).rejects.toMatchObject({ status: 404 });
    await expect(rescheduleCalendarItem("task", "olmayan", "2026-10-09")).rejects.toMatchObject({ status: 404 });
    await expect(rescheduleCalendarItem("task", "x", "9 Ekim")).rejects.toMatchObject({ status: 400 });
    await expect(rescheduleCalendarItem("payment" as never, "x", "2026-10-09")).rejects.toMatchObject({ status: 400 });
  });
});

describe("bildirimi kaldırma (çarpı)", () => {
  it("yalnızca kendi bildirimi kaldırılır; listeden ve okunmamış sayısından düşer; aynı hatırlatma tekrar oluşmaz", async () => {
    const { dismissNotification, listNotifications, notify, unreadCount } = await import("./notification-service");
    const user = await newUser();
    const other = await newUser();
    await notify({ type: "TASK_OVERDUE", userIds: [user.id], title: "Teslim geçti", dedupeKey: "overdue:t1" });
    await notify({ type: "TASK_ASSIGNED", userIds: [user.id], title: "Görev atandı" });
    const { items } = await listNotifications(user.id);
    const overdue = items.find((n) => n.title === "Teslim geçti")!;

    await expect(dismissNotification(other.id, overdue.id)).rejects.toMatchObject({ status: 404 });
    await dismissNotification(user.id, overdue.id);
    await expect(dismissNotification(user.id, overdue.id)).rejects.toMatchObject({ status: 404 });

    expect((await listNotifications(user.id)).items.map((n) => n.title)).toEqual(["Görev atandı"]);
    expect(await unreadCount(user.id)).toBe(1);
    // Günlük iş ertesi gün aynı anahtarla tekrar denese de kaldırılan bildirim geri gelmez.
    expect(await notify({ type: "TASK_OVERDUE", userIds: [user.id], title: "Teslim geçti", dedupeKey: "overdue:t1" })).toBe(0);
    expect((await listNotifications(user.id)).items).toHaveLength(1);
  });
});

/**
 * Gerçek SMTP gönderimi yerel bir test posta sunucusuyla denenir; yalnızca SMTP_TEST_URL verilince çalışır:
 *   docker run -d --name sosyalcan-mailpit-test -p 1125:1025 -p 8125:8025 axllent/mailpit
 *   SMTP_TEST_URL=smtp://localhost:1125 MAILPIT_API=http://localhost:8125 npm run test:db -- extras
 */
describe.runIf(process.env.SMTP_TEST_URL)("e-posta (gerçek SMTP)", () => {
  beforeAll(() => vi.stubEnv("SMTP_URL", process.env.SMTP_TEST_URL!));
  afterAll(() => vi.unstubAllEnvs());
  const inbox = async () => (await (await fetch(`${process.env.MAILPIT_API}/api/v1/messages`)).json()).messages as { Subject: string; To: { Address: string }[] }[];

  it("e-posta gerçekten gider; şifre sıfırlama/kod içeriği giden kutusunda saklanmaz", async () => {
    const { sendEmail } = await import("@/lib/email");
    const stamp = Date.now();
    expect(await sendEmail({ to: `alici${stamp}@x.co`, subject: `Normal ${stamp}`, text: "merhaba" })).toBe("SENT");
    expect(await sendEmail({ to: `alici${stamp}@x.co`, subject: `Kod 123456 ${stamp}`, text: "kodun 123456", sensitive: true })).toBe("SENT");

    const received = (await inbox()).filter((m) => m.To[0]?.Address === `alici${stamp}@x.co`).map((m) => m.Subject);
    expect(received.sort()).toEqual([`Kod 123456 ${stamp}`, `Normal ${stamp}`]); // alıcıya tam içerik gider

    const outbox = await prisma.emailMessage.findMany({ where: { to: `alici${stamp}@x.co` }, orderBy: { createdAt: "asc" } });
    expect(outbox.map((m) => m.status)).toEqual(["SENT", "SENT"]);
    expect(outbox[0].text).toBe("merhaba");
    expect(JSON.stringify(outbox[1])).not.toContain("123456");
  });
});
