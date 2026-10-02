/**
 * Veritabanı başlangıç verisi: `npm run seed`
 *
 * İki kip vardır:
 * - **production** (`NODE_ENV=production` ya da `SEED_MODE=production`): örnek veri ve varsayılan şifre YOK.
 *   Yalnızca ilk Admin hesabı `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` (/ `SEED_ADMIN_NAME`) ortam
 *   değişkenlerinden kurulur; şifre güçlü değilse betik durur. Admin ilk girişte şifresini değiştirmek zorundadır.
 *   Sistemde zaten kullanıcı varsa hiçbir şey yapmaz.
 * - **demo** (geliştirme varsayılanı): 4 rol için bilinen şifreli deneme hesapları + örnek müşteri/görev/çekim/finans.
 *   Bu hesaplar yalnızca yerel geliştirme ve testler içindir; canlıda demo kipi çalıştırılamaz.
 */
import { PrismaClient, Role } from "@prisma/client";
import { z } from "zod";
import { passwordSchema } from "../src/lib/validations/auth";
import { hashPassword } from "../src/lib/services/user-service";
import { DEFAULT_OPTIONS } from "../src/lib/options";
import { ensureCurrentMonthInstance, markPaymentInstancePaid } from "../src/lib/services/payment-plan-service";

const prisma = new PrismaClient();

const USERS: { name: string; email: string; password: string; role: Role }[] = [
  { name: "Admin", email: "admin@sosyalcan.local", password: "admin1234", role: "ADMIN" },
  { name: "Operasyon Kullanıcısı", email: "operasyon@sosyalcan.local", password: "operasyon1234", role: "OPERATIONS" },
  { name: "Finans Kullanıcısı", email: "finans@sosyalcan.local", password: "finans1234", role: "FINANCE" },
  { name: "Viewer Kullanıcısı", email: "viewer@sosyalcan.local", password: "viewer1234", role: "VIEWER" },
];

const SAMPLE_CUSTOMERS = [
  { name: "Lezzet Duragi Restoran", contact: "0532 111 22 33", notes: "Aylık içerik üretimi, haftada 2 çekim." },
  { name: "Mavi Kirtasiye", contact: "info@mavikirtasiye.com", notes: "Sadece sosyal medya yönetimi." },
  { name: "Atlas Spor Merkezi", contact: "0212 444 55 66", notes: "Drone çekimi talep ediyor, açılış kampanyası." },
];

async function seedProduction() {
  const input = z
    .object({
      SEED_ADMIN_EMAIL: z.string({ error: "tanımlı değil" }).email("geçerli bir e-posta olmalı"),
      SEED_ADMIN_PASSWORD: z.string({ error: "tanımlı değil" }).pipe(passwordSchema),
      SEED_ADMIN_NAME: z.string().min(2).default("Yönetici"),
    })
    .safeParse(process.env);
  if (!input.success) {
    const issue = input.error.issues[0];
    throw new Error(`Canlı kurulum için ${String(issue.path[0])}: ${issue.message}`);
  }
  if ((await prisma.user.count()) > 0) {
    console.log("Kullanıcılar zaten var; canlı seed hiçbir şey yapmadı.");
    return;
  }
  for (const o of DEFAULT_OPTIONS) {
    await prisma.optionItem.upsert({ where: { id: o.id }, update: {}, create: { ...o } });
  }
  const { SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME } = input.data;
  await prisma.user.create({
    data: {
      name: SEED_ADMIN_NAME,
      email: SEED_ADMIN_EMAIL.trim().toLowerCase(),
      passwordHash: await hashPassword(SEED_ADMIN_PASSWORD),
      role: "ADMIN",
      mustChangePassword: true,
    },
  });
  // Şifre konsola yazılmaz.
  console.log(`İlk Admin oluşturuldu: ${SEED_ADMIN_EMAIL} (ilk girişte şifre değiştirmesi istenecek)`);
}

async function main() {
  const mode = process.env.SEED_MODE ?? (process.env.NODE_ENV === "production" ? "production" : "demo");
  if (mode === "production") {
    await seedProduction();
    return;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Demo seed (bilinen şifreli deneme hesapları) canlı ortamda çalıştırılamaz.");
  }
  console.log("Demo kipi: deneme hesapları ve örnek veri (yalnızca geliştirme içindir).");
  await seedDemo();
}

async function seedDemo() {
  for (const u of USERS) {
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (existing) {
      console.log(`Zaten var: ${u.email}`);
      continue;
    }
    await prisma.user.create({
      data: {
        name: u.name,
        email: u.email,
        passwordHash: await hashPassword(u.password),
        role: u.role,
      },
    });
    console.log(`Oluşturuldu -> ${u.email} / ${u.password} (${u.role})`);
  }

  for (const c of SAMPLE_CUSTOMERS) {
    const existing = await prisma.customer.findFirst({ where: { name: c.name } });
    if (existing) {
      continue;
    }
    await prisma.customer.create({ data: c });
    console.log(`Örnek müşteri oluşturuldu -> ${c.name}`);
  }

  const lezzet = await prisma.customer.findFirst({ where: { name: "Lezzet Duragi Restoran" } });
  const atlas = await prisma.customer.findFirst({ where: { name: "Atlas Spor Merkezi" } });
  const opsUser = await prisma.user.findUnique({ where: { email: "operasyon@sosyalcan.local" } });

  const inDays = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

  // Başlangıç seçenekleri migration'larla gelir; veritabanı başka yoldan kurulduysa diye burada da garanti edilir.
  for (const o of DEFAULT_OPTIONS) {
    await prisma.optionItem.upsert({ where: { id: o.id }, update: {}, create: { ...o } });
  }

  const SAMPLE_TASKS: { title: string; description?: string; statusId: string; priority: "LOW" | "MEDIUM" | "HIGH"; customerId?: string; assigneeId?: string; dueDate?: Date }[] = [
    { title: "Instagram reels kurgusu", description: "Haftalık reels içeriği", statusId: "opt_task_editing", priority: "HIGH", customerId: atlas?.id, assigneeId: opsUser?.id, dueDate: inDays(2) },
    { title: "Menü çekimi planı", description: "Yeni menü için çekim planı hazırla", statusId: "opt_task_waiting", priority: "MEDIUM", customerId: lezzet?.id, dueDate: inDays(5) },
    { title: "Açılış kampanyası taslağı", statusId: "opt_task_revision", priority: "HIGH", customerId: atlas?.id, assigneeId: opsUser?.id, dueDate: inDays(1) },
    { title: "Geçen ay performans raporu", statusId: "opt_task_done", priority: "LOW" },
  ];

  for (const t of SAMPLE_TASKS) {
    const existing = await prisma.task.findFirst({ where: { title: t.title } });
    if (existing) {
      continue;
    }
    await prisma.task.create({ data: t });
    console.log(`Örnek görev oluşturuldu -> ${t.title}`);
  }

  const SAMPLE_EQUIPMENT: { category: string; items: string[] }[] = [
    { category: "Kamera", items: ["Sony A7 IV", "Canon EOS R6"] },
    { category: "Lens", items: ["24-70 mm f/2.8", "50 mm f/1.8"] },
    { category: "Ses", items: ["Yaka mikrofonu", "Shotgun mikrofon"] },
    { category: "Işık", items: ["LED panel", "Softbox"] },
    { category: "Stabilizasyon ve Drone", items: ["Gimbal", "Tripod", "DJI Mini 4 Pro"] },
  ];
  for (const [ci, group] of SAMPLE_EQUIPMENT.entries()) {
    const category =
      (await prisma.optionItem.findFirst({ where: { kind: "EQUIPMENT_CATEGORY", label: group.category } })) ??
      (await prisma.optionItem.create({ data: { kind: "EQUIPMENT_CATEGORY", label: group.category, sortOrder: ci } }));
    for (const [ii, label] of group.items.entries()) {
      const existing = await prisma.optionItem.findFirst({ where: { kind: "EQUIPMENT", label, parentId: category.id } });
      if (existing) continue;
      await prisma.optionItem.create({ data: { kind: "EQUIPMENT", label, parentId: category.id, sortOrder: ii } });
      console.log(`Örnek ekipman oluşturuldu -> ${group.category} · ${label}`);
    }
  }

  // Örnek ödeme yöntemleri (admin Ayarlar → Seçenek Listeleri → Finans'tan değiştirebilir).
  for (const [i, label] of ["Nakit", "Havale / EFT", "Kredi Kartı"].entries()) {
    const existing = await prisma.optionItem.findFirst({ where: { kind: "PAYMENT_METHOD", label } });
    if (!existing) {
      await prisma.optionItem.create({ data: { kind: "PAYMENT_METHOD", label, sortOrder: i } });
      console.log(`Örnek ödeme yöntemi oluşturuldu -> ${label}`);
    }
  }

  const SAMPLE_SHOOTS: { typeId: string; scheduledAt: Date; location?: string; customerId?: string; assigneeId?: string; deliveryStatusId: string }[] = [
    { typeId: "opt_type_drone", scheduledAt: inDays(3), location: "Atlas Spor Merkezi", customerId: atlas?.id, assigneeId: opsUser?.id, deliveryStatusId: "opt_status_planned" },
    { typeId: "opt_type_video", scheduledAt: inDays(1), location: "Lezzet Durağı Restoran", customerId: lezzet?.id, assigneeId: opsUser?.id, deliveryStatusId: "opt_status_planned" },
  ];

  for (const s of SAMPLE_SHOOTS) {
    const existing = await prisma.shoot.findFirst({ where: { location: s.location } });
    if (existing) {
      continue;
    }
    // Uygulamadaki gibi: teslim kontrol listesi admin'in şablonundan kopyalanır.
    const template = await prisma.optionItem.findMany({
      where: { kind: "DELIVERY_CHECKLIST", archivedAt: null },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    await prisma.shoot.create({
      data: { ...s, checklist: { create: template.map((t, i) => ({ label: t.label, sortOrder: i })) } },
    });
    console.log(`Örnek çekim oluşturuldu -> ${s.location}`);
  }

  const SAMPLE_APPOINTMENTS: { title: string; startsAt: Date; customerId?: string }[] = [
    { title: "Lezzet Durağı ile aylık değerlendirme", startsAt: inDays(4), customerId: lezzet?.id },
  ];

  for (const a of SAMPLE_APPOINTMENTS) {
    const existing = await prisma.appointment.findFirst({ where: { title: a.title } });
    if (existing) {
      continue;
    }
    await prisma.appointment.create({ data: a });
    console.log(`Örnek randevu oluşturuldu -> ${a.title}`);
  }

  const mavi = await prisma.customer.findFirst({ where: { name: "Mavi Kirtasiye" } });

  const SAMPLE_TRANSACTIONS: { type: "INCOME" | "EXPENSE"; amount: number; category?: string; description?: string }[] = [
    { type: "EXPENSE", amount: 1500000, category: "Kira", description: "Ofis kirası" },
    { type: "EXPENSE", amount: 850000, category: "Ekipman", description: "İkinci el gimbal alımı" },
    { type: "EXPENSE", amount: 300000, category: "Personel", description: "Freelance kurgucu ödemesi" },
  ];
  for (const t of SAMPLE_TRANSACTIONS) {
    const existing = await prisma.transaction.findFirst({ where: { description: t.description } });
    if (existing) {
      continue;
    }
    await prisma.transaction.create({ data: t });
    console.log(`Örnek işlem oluşturuldu -> ${t.description}`);
  }

  if ((await prisma.partner.count()) === 0) {
    await prisma.partner.createMany({
      data: [
        { name: "Ortak 1", sharePercent: 35, position: 0 },
        { name: "Ortak 2", sharePercent: 35, position: 1 },
        { name: "Ortak 3", sharePercent: 30, position: 2 },
      ],
    });
    console.log("Varsayılan ortaklar oluşturuldu (%35 / %35 / %30)");
  }

  const SAMPLE_PLANS: { title: string; monthlyAmount: number; billingDay: number; customerId?: string; markPaid: boolean }[] = [
    { title: "Aylık Sosyal Medya Yönetimi", monthlyAmount: 500000, billingDay: 5, customerId: lezzet?.id, markPaid: true },
    { title: "İçerik Üretim Paketi", monthlyAmount: 350000, billingDay: 15, customerId: mavi?.id, markPaid: false },
  ];

  for (const p of SAMPLE_PLANS) {
    if (!p.customerId) continue;
    const existing = await prisma.paymentPlan.findFirst({ where: { title: p.title, customerId: p.customerId } });
    if (existing) {
      continue;
    }
    const plan = await prisma.paymentPlan.create({
      data: { title: p.title, monthlyAmount: p.monthlyAmount, billingDay: p.billingDay, customerId: p.customerId },
    });
    const instance = await ensureCurrentMonthInstance(plan.id);
    if (p.markPaid) {
      await markPaymentInstancePaid(instance.id);
    }
    console.log(`Örnek ödeme planı oluşturuldu -> ${p.title}${p.markPaid ? " (bu ay ödendi)" : " (bu ay bekliyor)"}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
