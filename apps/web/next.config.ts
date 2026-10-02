import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * İçerik Güvenlik Politikası: sayfa yalnızca kendi sunucumuzdan script/stil/görsel
 * yükleyebilir, başka siteye form gönderemez ve başka bir sitenin içine
 * (iframe) gömülemez. Tema seçimi için tek satırlık satır içi script ve
 * Next.js'in hidrasyon script'leri nedeniyle 'unsafe-inline' gerekir;
 * geliştirme modundaki hızlı yenileme ayrıca 'unsafe-eval' ister.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // Ajans logosu ayarlardan harici bir https adresi olarak verilebiliyor.
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // "Yeni cihazdan giriş" uyarısında cihazın adı için (Windows 10/11 ayrımı, Android telefon modeli). Chrome/Edge gönderir.
  { key: "Accept-CH", value: "Sec-CH-UA-Platform-Version, Sec-CH-UA-Model" },
  // HTTPS zorunluluğu yalnızca üretimde (yerelde http://localhost kullanılıyor).
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  // Geliştirme simgesi sol alttaki kullanıcı kartının üstüne biniyordu (yalnızca `npm run dev`).
  devIndicators: { position: "bottom-right" },
  // "X-Powered-By: Next.js" başlığı saldırgana sürüm/teknoloji bilgisi vermesin.
  poweredByHeader: false,
  // Docker imajı için tek klasörlük üretim çıktısı (apps/web/Dockerfile BUILD_STANDALONE=1 verir).
  ...(process.env.BUILD_STANDALONE === "1" ? { output: "standalone" as const } : {}),
  // Yüklenen dosyalar ve test çıktıları üretim paketine girmesin.
  outputFileTracingExcludes: { "*": ["uploads/**", ".e2e-uploads/**", "e2e/**", "test-results/**", "playwright-report/**", "scripts/**"] },
  experimental: {
    // Proxy istek gövdesini bellekte tutar (varsayılan sınır 10 MB). Dosya ekleri en fazla UPLOAD_MAX_MB
    // (varsayılan 10 MB) + form ek yükü olabilir; sınırın altında kalsın diye biraz geniş.
    proxyClientMaxBodySize: "12mb",
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // API yanıtları (kişisel/finans verisi) hiçbir ara katmanda önbelleğe alınmasın.
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
      // Yüklenen dosyalar: tarayıcıda açılsa bile betik çalıştıramaz, başka kaynak yükleyemez (sandbox).
      // Aynı başlık birden çok kurala uyarsa sonuncusu geçerli olur; genel CSP'yi bu adres için daraltır.
      {
        source: "/api/attachments/:id",
        headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox" }],
      },
    ];
  },
};

export default nextConfig;
