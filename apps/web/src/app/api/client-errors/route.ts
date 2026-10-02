import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createRateLimiter, createSharedStore, clientIp } from "@/lib/rate-limit";
import { recordError } from "@/lib/error-tracking";

/**
 * Tarayıcıdaki hata sayfası ve mobil uygulama beklenmedik hataları buraya bildirir. Giriş ekranındaki
 * hatalar da kaybolmasın diye oturum istemez; bu yüzden boyut sınırlı ve IP başına dakikada 20 istekle sınırlı.
 */
const schema = z.object({
  source: z.enum(["web", "mobile"]),
  message: z.string().min(1).max(1000),
  path: z.string().max(300).optional(),
  digest: z.string().max(100).optional(),
  stack: z.string().max(4000).optional(),
});

const globalForErrors = globalThis as unknown as { clientErrorLimiter?: ReturnType<typeof createRateLimiter> };
const limiter = (globalForErrors.clientErrorLimiter ??= createRateLimiter({ max: 20, windowMs: 60_000, store: createSharedStore() }));

export async function POST(request: NextRequest) {
  if (!(await limiter.consume(`client-error:${clientIp(request.headers)}`)).allowed) {
    return new NextResponse(null, { status: 429 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Geçersiz hata bildirimi" }, { status: 400 });
  }
  await recordError(parsed.data);
  return new NextResponse(null, { status: 204 });
}
