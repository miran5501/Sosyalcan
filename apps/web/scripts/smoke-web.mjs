/**
 * Web arayüzü duman testi: dört rolle giriş yapıp tüm sayfaları gezer; HTTP durumunu, sayfa
 * gövdesindeki hata izlerini ve rol bazlı içerik kurallarını (örn. Operasyon'da finans bölümü
 * olmamalı) kontrol eder. Çalışan bir sunucu ister:
 *   npm run dev            (veya `npm run build && npm start` + AUTH_TRUST_HOST=true)
 *   npm run smoke          (varsayılan http://localhost:3000)
 *   SMOKE_BASE=http://localhost:3100 npm run smoke
 * Test hesapları seed'den gelir (prisma/seed.ts). Yalnızca GET yapar, veri değiştirmez.
 */
const BASE = process.env.SMOKE_BASE ?? "http://localhost:3000";

const ACCOUNTS = {
  ADMIN: ["admin@sosyalcan.local", "admin1234"],
  OPERATIONS: ["operasyon@sosyalcan.local", "operasyon1234"],
  FINANCE: ["finans@sosyalcan.local", "finans1234"],
  VIEWER: ["viewer@sosyalcan.local", "viewer1234"],
};

const ERROR_MARKERS = ["Application error", "Internal Server Error", "Unhandled Runtime Error", "__next_error__", "This page couldn't load"];

const ALL = ["ADMIN", "OPERATIONS", "FINANCE", "VIEWER"];
const OPS = ["ADMIN", "OPERATIONS"]; // ekleme/düzenleme formları
const FINANCE_VIEW = ["ADMIN", "FINANCE", "VIEWER"]; // Operasyon finansı hiç göremez
const FINANCE_MANAGE = ["ADMIN", "FINANCE"];

/** Rol finans verisini görebiliyorsa `has`, göremiyorsa `hasNot` listesine ekler. */
const financeContent = (role, text) => (FINANCE_VIEW.includes(role) ? { has: [text] } : { hasNot: [text] });
/** Rol düzenleyebiliyorsa düğmeler olmalı, değilse olmamalı (salt okunur görünüm). */
const editButtons = (role, ...texts) => (OPS.includes(role) ? { has: texts } : { hasNot: texts });
const financeEditButtons = (role, ...texts) => (FINANCE_MANAGE.includes(role) ? { has: texts } : { hasNot: texts });
const merge = (...parts) => ({ has: parts.flatMap((p) => p.has ?? []), hasNot: parts.flatMap((p) => p.hasNot ?? []) });

/** Rol sayfayı görebiliyorsa 200 + içerik kuralı; göremiyorsa yönlendirme (3xx). `status` verilirse tüm roller için o durum. */
const STATIC_PAGES = [
  { path: "/", roles: ALL },
  { path: "/customers", roles: ALL },
  { path: "/customers/new", roles: OPS, check: () => ({ has: ["Etiketler"] }) },
  { path: "/tasks/new", roles: OPS, check: () => ({ has: ["Nerede paylaşılacak"] }) },
  { path: "/tasks", roles: ALL, check: (r) => (r === "ADMIN" ? { has: ["Sütunları Yönet", "Bekliyor"] } : { has: ["Bekliyor"], hasNot: ["Sütunları Yönet"] }) },
  { path: "/shoots/new", roles: OPS, check: () => ({ has: ["Ekipman", "Ekipman notu", "Nerede paylaşılacak"] }) },
  // Seçenek listeleri yalnızca Admin tarafından yönetilir (Ayarlar → Seçenek Listeleri); diğer roller ana sayfaya yönlenir.
  { path: "/settings/options", roles: ["ADMIN"], check: () => ({ has: ["Görev Durumları", "Tamamlandı sayılır"] }) },
  { path: "/settings/options?tab=shoots", roles: ["ADMIN"], check: () => ({ has: ["Çekim Türleri", "Teslim Durumları", "Teslim Kontrol Listesi", "Ham görüntüler yedeklendi"] }) },
  { path: "/settings/options?tab=publish", roles: ["ADMIN"], check: () => ({ has: ["Paylaşım Platformları"] }) },
  { path: "/settings/options?tab=equipment", roles: ["ADMIN"], check: () => ({ has: ["Ekipman", "ekipman kategorisi"] }) },
  { path: "/settings/options?tab=finance", roles: ["ADMIN"], check: () => ({ has: ["Finans Kategorileri"] }) },
  { path: "/shoots/options", roles: [] }, // eski adres: herkes yönlendirilir
  { path: "/shoots", roles: ALL, check: (r) => (r === "ADMIN" ? { has: ["Seçenekleri Yönet"] } : { hasNot: ["Seçenekleri Yönet"] }) },
  { path: "/calendar", roles: ALL, check: (r) => financeContent(r, "Ödeme vadesi") },
  { path: "/calendar?view=week", roles: ALL, check: (r) => financeContent(r, "Ödeme vadesi") },
  { path: "/calendar?view=day&date=2026-09-21", roles: ALL, check: (r) => financeContent(r, "Ödeme vadesi") },
  { path: "/calendar?month=2026-09", roles: ALL }, // eski bağlantı biçimi
  { path: "/calendar/new-appointment", roles: OPS, check: () => ({ has: ["Katılımcılar"] }) },
  { path: "/finance", roles: FINANCE_VIEW, check: () => ({ has: ["Gider dağılımı", "Excel", "Yazdır"] }) },
  { path: "/finance?month=2026-08", roles: FINANCE_VIEW }, // başka ay
  { path: "/finance/new", roles: FINANCE_MANAGE, check: () => ({ has: ["Kategori", "Yeni kategori", "KDV oranı", "Fatura no"] }) },
  { path: "/finance/revenue-share", roles: FINANCE_VIEW },
  { path: "/payment-plans", roles: FINANCE_VIEW },
  { path: "/payment-plans/new", roles: FINANCE_MANAGE },
  { path: "/settings", roles: ["ADMIN"], check: () => ({ has: ["Genel Ajans Bilgileri", "Seçenek Listeleri", "Denetim Kaydı", "Son giriş"] }) },
  { path: "/settings/audit", roles: ["ADMIN"], check: () => ({ has: ["Denetim Kaydı", "Giriş yapıldı"] }) },
  { path: "/account", roles: ALL, check: (r) => ({ has: ["Hesabım", "Şifre Değiştir", "Tüm cihazlardan çıkış yap", "Bildirim Tercihleri"], ...(["ADMIN", "FINANCE"].includes(r) ? {} : { hasNot: ["Müşteri ödemesi gecikti"] }) }) },
  { path: "/notifications", roles: ALL, check: () => ({ has: ["Bildirimler", "Okunmamış"] }) },
  { path: "/settings/notifications", roles: ["ADMIN"], check: () => ({ has: ["Bildirimler ve E-posta", "Giden kutusu", "Günlük hatırlatmalar"] }) },
  { path: "/settings/privacy", roles: ["ADMIN"], check: () => ({ has: ["Aydınlatma metni", "Saklama süreleri"] }) },
  { path: "/settings/system", roles: ["ADMIN"], check: () => ({ has: ["Sistem Durumu", "Veritabanı", "Europe/Istanbul"] }) },
  { path: "/account#2fa", roles: ALL, check: () => ({ has: ["İki Adımlı Doğrulama", "Verilerimi indir"] }) },
  { path: "/shoots?when=past", roles: ALL, check: () => ({ has: ["Yaklaşan", "Geçmiş"] }) },
  { path: "/customers?page=2", roles: ALL },
  { path: "/customers/import", roles: OPS, check: () => ({ has: ["Müşteri Aktar", "Şablonu indir"] }) },
  { path: "/account#cihazlar", roles: ALL, check: () => ({ has: ["Giriş Yapılan Cihazlar"] }) },
  { path: "/tasks?allDone=1", roles: ALL },
  // Bulunamayan kayıtlar hata ekranı değil standart 404 vermeli
  { path: "/customers/olmayan-id", status: 404 },
  { path: "/tasks/olmayan-id/edit", status: 404 },
  { path: "/shoots/olmayan-id/edit", status: 404 },
  { path: "/calendar/olmayan-id/edit", status: 404 },
];

/** Gerçek kayıt kimliği gerektiren sayfalar; kimlikler Admin oturumuyla API'den alınır. Kayıt yoksa atlanır. */
const RECORD_PAGES = [
  {
    api: "/api/customers",
    build: (id, name) => ({
      path: `/customers/${id}`,
      roles: ALL,
      // Ödeme planları finans verisi: Operasyon görmemeli
      check: (r) => merge({ has: [name, "Görevler", "Çekimler", "Randevular", "Etiketler", "Aktivite geçmişi"] }, financeContent(r, "Finans hareketleri")),
    }),
  },
  { api: "/api/customers", build: (id) => ({ path: `/customers/${id}/edit`, roles: ALL }) }, // yetkisiz roller salt okunur görür
  {
    api: "/api/tasks",
    build: (id) => ({
      path: `/tasks/${id}/edit`,
      roles: ALL,
      check: (r) => merge({ has: ["Yorumlar", "Bağlantılar", "Nerede paylaşılacak"] }, editButtons(r, "Kaydet", "Yorum Ekle")),
    }),
  },
  {
    api: "/api/shoots",
    build: (id) => ({ path: `/shoots/${id}/edit`, roles: ALL, check: (r) => merge({ has: ["Teslim Durumu", "Ekipman notu", "Nerede paylaşılacak", "Revizyon sayısı", "Teslim Kontrol Listesi", "Dosyalar"] }, editButtons(r, "Kaydet", "+ Ekipman ekle", "Dosya ekle")) }),
  },
  {
    api: "/api/appointments",
    build: (id) => ({ path: `/calendar/${id}/edit`, roles: ALL, check: (r) => merge({ has: ["Katılımcılar"] }, editButtons(r, "Kaydet", "Randevuyu sil")) }),
  },
  {
    // Finans kaydı detayı + fatura dosyaları: Operasyon hiç göremez, Viewer dosya ekleyemez.
    api: "/api/finance/transactions",
    build: (id) => ({ path: `/finance/${id}`, roles: FINANCE_VIEW, check: (r) => merge({ has: ["Dosyalar", "Tutar"] }, financeEditButtons(r, "Dosya ekle")) }),
  },
  {
    api: "/api/payment-plans",
    // Operasyon finansı hiç göremez (ana sayfaya yönlenir); Viewer salt okunur görür
    build: (id) => ({ path: `/payment-plans/${id}/edit`, roles: FINANCE_VIEW, check: (r) => financeEditButtons(r, "Kaydet") }),
  },
];

class Jar {
  cookies = new Map();
  absorb(res) {
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const [pair] = line.split(";");
      const i = pair.indexOf("=");
      this.cookies.set(pair.slice(0, i), pair.slice(i + 1));
    }
  }
  header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

async function request(jar, path, options = {}) {
  const res = await fetch(BASE + path, { redirect: "manual", ...options, headers: { cookie: jar.header(), ...options.headers } });
  jar.absorb(res);
  return res;
}

async function login(role) {
  const jar = new Jar();
  const csrf = await (await request(jar, "/api/auth/csrf")).json();
  const [email, password] = ACCOUNTS[role];
  const res = await request(jar, "/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, email, password, json: "true" }),
  });
  await res.arrayBuffer();
  const session = await (await request(jar, "/api/auth/session")).json();
  if (session?.user?.role !== role) throw new Error(`${role} girişi başarısız (oturum: ${JSON.stringify(session)})`);
  return jar;
}

const problems = [];
const rows = [];

function record(role, path, status, note, bad) {
  rows.push({ role, path, status, note });
  if (bad) problems.push(`${role} ${path}: ${bad}`);
}

async function checkPage(jar, role, entry) {
  const { path } = entry;
  const res = await request(jar, path);
  const status = res.status;
  const location = res.headers.get("location");
  const body = status === 200 ? await res.text() : (await res.arrayBuffer(), "");
  const note = location ? `-> ${new URL(location, BASE).pathname}` : "";

  if (status >= 500) return record(role, path, status, "sunucu hatası", "5xx");
  const marker = ERROR_MARKERS.find((m) => body.includes(m));
  if (marker) return record(role, path, status, `hata izi: ${marker}`, `gövdede "${marker}"`);

  if (entry.status) {
    return record(role, path, status, note, status === entry.status ? null : `${entry.status} bekleniyordu`);
  }

  const allowed = entry.roles.includes(role);
  if (allowed && status !== 200) return record(role, path, status, note, "200 bekleniyordu");
  if (!allowed && !(status >= 300 && status < 400)) return record(role, path, status, note, "yönlendirme (3xx) bekleniyordu, sayfa açıldı");

  if (allowed && entry.check) {
    const { has = [], hasNot = [] } = entry.check(role);
    const missing = has.filter((t) => !body.includes(t));
    const unexpected = hasNot.filter((t) => body.includes(t));
    if (missing.length) return record(role, path, status, note, `sayfada olması gereken metin yok: ${missing.map((m) => `"${m}"`).join(", ")}`);
    if (unexpected.length) return record(role, path, status, note, `sayfada OLMAMASI gereken metin var: ${unexpected.map((m) => `"${m}"`).join(", ")}`);
  }
  record(role, path, status, note, null);
}

async function main() {
  // Oturumsuz: sayfalar giriş sayfasına yönlenmeli.
  const anon = new Jar();
  for (const { path } of STATIC_PAGES) {
    const res = await request(anon, path);
    await res.arrayBuffer();
    const to = res.headers.get("location");
    const ok = res.status >= 300 && res.status < 400 && to && new URL(to, BASE).pathname === "/login";
    record("oturumsuz", path, res.status, to ? `-> ${new URL(to, BASE).pathname}` : "", ok ? null : "/login adresine yönlenmesi bekleniyordu");
  }

  // Herkese açık sayfalar (giriş gerektirmez): şifremi unuttum, sıfırlama, KVKK aydınlatma metni.
  for (const [path, text] of [["/forgot-password", "Şifremi unuttum"], ["/reset-password?token=gecersiz", "geçersiz"], ["/kvkk", "Aydınlatma Metni"]]) {
    const res = await request(anon, path);
    const html = (await res.text()).replace(/<!-- -->/g, "");
    record("oturumsuz", path, res.status, "", res.status === 200 && html.includes(text) ? null : `200 ve "${text}" bekleniyordu`);
  }

  // Kayıt sayfalarının kimlikleri Admin oturumuyla toplanır ve her rol için aynı kayıtlar denenir.
  const admin = await login("ADMIN");
  const recordPages = [];
  for (const { api, build } of RECORD_PAGES) {
    const list = await (await request(admin, api)).json();
    const item = Array.isArray(list) ? list[0] : null;
    if (item?.id) recordPages.push(build(item.id, item.name ?? item.title));
  }

  for (const role of Object.keys(ACCOUNTS)) {
    const jar = role === "ADMIN" ? admin : await login(role);
    for (const entry of [...STATIC_PAGES, ...recordPages]) await checkPage(jar, role, entry);
  }

  const width = Math.max(...rows.map((r) => r.path.length)) + 2;
  for (const r of rows) console.log(`${r.role.padEnd(11)}${r.path.padEnd(width)}${String(r.status).padEnd(5)}${r.note}`);
  console.log(`\n${rows.length} kontrol, ${problems.length} sorun`);
  for (const p of problems) console.log(`  SORUN: ${p}`);
  process.exit(problems.length ? 1 : 0);
}

main().catch((e) => {
  console.error("Duman testi çalışamadı:", e.message);
  process.exit(2);
});
