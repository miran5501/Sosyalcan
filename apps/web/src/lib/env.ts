import { z } from "zod";

/**
 * Ortam değişkenlerinin doğrulaması. Eksik ya da zayıf bir gizli anahtarla uygulama
 * hiç açılmaz (instrumentation.ts) ve derleme başlamaz (scripts/check-env.ts):
 * "çalışıyor gibi görünüp girişte patlayan" ya da tahmin edilebilir anahtarla imzalanan
 * oturumlar mümkün olmasın.
 */
const PLACEHOLDER = /^degistir|change-?me|^secret$|^password$/i;

const secret = (name: string, min: number) =>
  z
    .string({ error: `${name} tanımlı değil` })
    .min(min, `${name} en az ${min} karakter olmalı`)
    .refine((v) => !PLACEHOLDER.test(v), `${name} örnek değerde bırakılmış; rastgele bir değer üretin`)
    .refine((v) => new Set(v).size >= 10, `${name} çok tekdüze (en az 10 farklı karakter içermeli)`);

const optionalInt = (min: number, max: number) =>
  z
    .string()
    .regex(/^\d+$/, "tam sayı olmalı")
    .refine((v) => Number(v) >= min && Number(v) <= max, `${min}–${max} arasında olmalı`)
    .optional();

export const envSchema = z.object({
  DATABASE_URL: z
    .string({ error: "DATABASE_URL tanımlı değil" })
    .regex(/^postgres(ql)?:\/\//, "DATABASE_URL bir PostgreSQL adresi olmalı (postgresql://...)"),
  AUTH_SECRET: secret("AUTH_SECRET", 32),
  // Tanımlı değilse cron uçları her isteği reddeder (güvenli varsayılan); tanımlıysa güçlü olmalı.
  CRON_SECRET: secret("CRON_SECRET", 16).optional(),
  REDIS_URL: z.string().regex(/^rediss?:\/\//, "REDIS_URL redis:// ile başlamalı").optional(),
  API_RATE_LIMIT_PER_MINUTE: optionalInt(10, 100_000),
  MOBILE_ACCESS_TOKEN_TTL_SECONDS: optionalInt(10, 24 * 60 * 60),
  // E-posta: tanımlı değilse geliştirme modu (e-postalar gönderilmez, giden kutusunda görülür).
  SMTP_URL: z.string().regex(/^smtps?:\/\//, "SMTP_URL smtp:// ya da smtps:// ile başlamalı").optional(),
  EMAIL_FROM: z.string().min(3).optional(),
  APP_URL: z.string().regex(/^https?:\/\//, "APP_URL http(s):// ile başlamalı").optional(),
  // Yeni hatalar için Slack/Discord/Teams gelen webhook adresi (isteğe bağlı).
  ERROR_WEBHOOK_URL: z.string().regex(/^https:\/\//, "ERROR_WEBHOOK_URL https:// ile başlamalı").optional(),
  APP_TIME_ZONE: z.string().min(3).optional(),
  // Dosya ekleri: "local" (sunucu diski, varsayılan) ya da "s3" (AWS S3, Cloudflare R2, MinIO...).
  STORAGE_DRIVER: z.enum(["local", "s3"], { error: 'STORAGE_DRIVER "local" ya da "s3" olmalı' }).optional(),
  STORAGE_DIR: z.string().min(1).optional(),
  S3_ENDPOINT: z.string().regex(/^https?:\/\//, "S3_ENDPOINT http(s):// ile başlamalı").optional(),
  S3_BUCKET: z.string().min(3).optional(),
  S3_REGION: z.string().min(2).optional(),
  S3_ACCESS_KEY_ID: z.string().min(3).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(8).optional(),
  // Proxy gövde sınırı (next.config.ts, 12 MB) nedeniyle en fazla 10.
  UPLOAD_MAX_MB: optionalInt(1, 10),
}).superRefine((env, ctx) => {
  // Canlıda gerçek e-posta açıkken APP_URL yoksa e-postalardaki bağlantılar localhost'a gider (çalışmaz).
  if (env.SMTP_URL && !env.APP_URL && process.env.NODE_ENV === "production") {
    ctx.addIssue({ code: "custom", path: ["APP_URL"], message: "APP_URL tanımlı değil (SMTP_URL varken e-postadaki bağlantılar için gerekli)" });
  }
  if (env.STORAGE_DRIVER !== "s3") return;
  for (const name of ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const) {
    if (!env[name]) ctx.addIssue({ code: "custom", path: [name], message: `${name} tanımlı değil (STORAGE_DRIVER=s3 için gerekli)` });
  }
});

export type EnvProblem = { name: string; message: string };

/** Sorun listesi (boşsa her şey yolunda). Değerlerin kendisi hiçbir zaman mesaja yazılmaz. */
export function checkEnv(env: Record<string, string | undefined> = process.env): EnvProblem[] {
  // Boş metin "tanımlı değil" sayılır.
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ""));
  const result = envSchema.safeParse(cleaned);
  if (result.success) {
    return [];
  }
  return result.error.issues.map((issue) => ({ name: String(issue.path[0] ?? "?"), message: issue.message }));
}

export function formatEnvProblems(problems: EnvProblem[]): string {
  return [
    "Ortam değişkenleri geçersiz; uygulama başlatılmadı:",
    ...problems.map((p) => `  - ${p.name}: ${p.message}`),
    "Örnek ve açıklamalar: apps/web/.env.example",
  ].join("\n");
}
