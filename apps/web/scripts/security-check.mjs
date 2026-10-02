/**
 * Güvenlik kontrolleri: çalışan sunucuya gerçek HTTP istekleriyle saldırgan gibi davranır.
 * Kullanım: önce `npm run dev` (ya da build + start), sonra `npm run security`.
 * Başka adres için: SMOKE_BASE=http://localhost:3100 npm run security
 *
 * Denenenler: sağlık kontrolü, güvenlik başlıkları, oturumsuz API, CSRF, mobil token
 * yenileme + çalıntı token tespiti + çıkış, giriş kilidi, genel istek sınırı, denetim kaydı.
 */
const BASE = process.env.SMOKE_BASE ?? "http://localhost:3000";
const ADMIN = ["admin@sosyalcan.local", "admin1234"];

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? `  (${detail})` : ""}`);
}

// Her çalıştırmada farklı "IP": önceki çalıştırmanın sayaçları bu çalıştırmayı etkilemesin.
const runId = Date.now() % 250;
const runSalt = Math.floor(Math.random() * 250);
const ip = (n) => ({ "x-forwarded-for": `10.${runId}.${n}.${runSalt}` });

const json = (body) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
async function post(path, body, headers = {}) {
  const res = await fetch(BASE + path, { ...json(body), headers: { "content-type": "application/json", ...headers } });
  return { status: res.status, data: await res.json().catch(() => null) };
}

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

async function webLogin([email, password]) {
  const jar = new Jar();
  const go = async (path, options = {}) => {
    const res = await fetch(BASE + path, { redirect: "manual", ...options, headers: { cookie: jar.header(), ...options.headers } });
    jar.absorb(res);
    return res;
  };
  const csrf = await (await go("/api/auth/csrf")).json();
  await (
    await go("/api/auth/callback/credentials", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrfToken: csrf.csrfToken, email, password, json: "true" }),
    })
  ).arrayBuffer();
  return go;
}

// 1) Sağlık kontrolü
{
  const res = await fetch(`${BASE}/api/health`);
  const data = await res.json();
  check("Sağlık kontrolü 200 ve veritabanı ayakta", res.status === 200 && data.database === "ok", `redis: ${data.redis}`);
}

// 2) Güvenlik başlıkları
{
  const res = await fetch(`${BASE}/login`);
  await res.arrayBuffer();
  const h = res.headers;
  check("Content-Security-Policy var, başka siteye gömülme yasak", (h.get("content-security-policy") ?? "").includes("frame-ancestors 'none'"));
  check("X-Frame-Options: DENY", h.get("x-frame-options") === "DENY");
  check("X-Content-Type-Options: nosniff", h.get("x-content-type-options") === "nosniff");
  check("Referrer-Policy tanımlı", Boolean(h.get("referrer-policy")));
  check("X-Powered-By başlığı gizli", !h.get("x-powered-by"));
}

// 3) Oturumsuz API
{
  const res = await fetch(`${BASE}/api/customers`);
  await res.arrayBuffer();
  check("Oturumsuz API isteği 401", res.status === 401);
  check("API yanıtları önbelleğe alınmaz (no-store)", (res.headers.get("cache-control") ?? "").includes("no-store"));
}

// 4) Mobil: giriş → yenileme → çalıntı token → çıkış
{
  const login = await post("/api/mobile/login", { email: ADMIN[0], password: ADMIN[1] }, ip(1));
  const first = login.data;
  check("Mobil giriş access + refresh token verir", login.status === 200 && first?.accessToken && first?.refreshToken, `expiresIn: ${first?.expiresIn}s`);

  const me = await fetch(`${BASE}/api/mobile/me`, { headers: { authorization: `Bearer ${first.accessToken}` } });
  check("Access token ile istek yapılabilir", me.status === 200);

  const refreshed = await post("/api/mobile/refresh", { refreshToken: first.refreshToken }, ip(1));
  check("Refresh token yeni bir çift verir (rotation)", refreshed.status === 200 && refreshed.data.refreshToken !== first.refreshToken);

  const reuse = await post("/api/mobile/refresh", { refreshToken: first.refreshToken }, ip(1));
  check("Kullanılmış refresh token tekrar kullanılamaz", reuse.status === 401);
  const familyDead = await post("/api/mobile/refresh", { refreshToken: refreshed.data.refreshToken }, ip(1));
  check("Çalınma şüphesinde o cihazın tüm oturumu kapanır", familyDead.status === 401);

  const second = (await post("/api/mobile/login", { email: ADMIN[0], password: ADMIN[1] }, ip(1))).data;
  const logout = await fetch(`${BASE}/api/mobile/logout`, { ...json({ refreshToken: second.refreshToken }), headers: { "content-type": "application/json", ...ip(1) } });
  const afterLogout = await post("/api/mobile/refresh", { refreshToken: second.refreshToken }, ip(1));
  check("Çıkıştan sonra refresh token geçersiz", logout.status === 204 && afterLogout.status === 401);

  const forged = await fetch(`${BASE}/api/mobile/me`, { headers: { authorization: `Bearer ${first.accessToken.slice(0, -4)}abcd` } });
  check("Kurcalanmış access token reddedilir", forged.status === 401);
}

// 5) Giriş kilidi (var olmayan hesap; aynı yanıt, hesap varlığı sızmaz)
{
  const email = `yok-${Date.now()}@sosyalcan.local`;
  const statuses = [];
  for (let i = 0; i < 6; i++) statuses.push((await post("/api/mobile/login", { email, password: "yanlis-sifre" }, ip(2))).status);
  check("5 hatalı denemeden sonra giriş kilitlenir (429)", statuses.slice(0, 5).every((s) => s === 401) && statuses[5] === 429, statuses.join(","));

  // IP başlığını her denemede değiştirmek hesap kilidini atlatmaz (20 deneme / 15 dk)
  const email2 = `yok2-${Date.now()}@sosyalcan.local`;
  let last = 0;
  for (let i = 0; i < 21; i++) last = (await post("/api/mobile/login", { email: email2, password: "yanlis" }, ip(100 + i))).status;
  check("IP değiştirerek deneme yapılsa da hesap kilidi devreye girer", last === 429);
}

// 6) CSRF: oturum çerezi olan tarayıcıdan, başka siteden gelen istek
{
  const go = await webLogin(ADMIN);
  const evil = await go("/api/customers", { method: "POST", headers: { "content-type": "application/json", origin: "https://kotu-site.example" }, body: "{}" });
  await evil.arrayBuffer();
  check("Başka siteden gelen API isteği reddedilir (CSRF)", evil.status === 403);
  const same = await go("/api/customers", { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: "{}" });
  await same.arrayBuffer();
  check("Aynı siteden gelen istek geçer (boş gövde → 400)", same.status === 400);

  // 7) Denetim kaydı yukarıdaki olayları gösteriyor mu?
  const audit = await go("/settings/audit?action=LOGIN_FAILED");
  const html = await audit.text();
  check("Denetim kaydında hatalı giriş denemeleri görünür", audit.status === 200 && html.includes("Hatalı giriş denemesi"));
}

// 8) Genel istek sınırı (dakikada 300)
{
  const headers = ip(3);
  let limited = 0;
  const batch = async (n) => {
    const all = await Promise.all(Array.from({ length: n }, () => fetch(`${BASE}/api/customers`, { headers }).then((r) => (r.arrayBuffer(), r.status))));
    limited += all.filter((s) => s === 429).length;
  };
  for (let i = 0; i < 7; i++) await batch(50);
  check("Dakikada 300'den fazla istek 429 alır", limited >= 40, `${limited} istek sınırlandı`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length} kontrol, ${failed.length} sorun`);
process.exit(failed.length ? 1 : 0);
