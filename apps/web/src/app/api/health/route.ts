import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redisHealth } from "@/lib/redis";

/**
 * Sağlık kontrolü (izleme / yük dengeleyici için, oturum gerektirmez).
 * Veritabanı yoksa 503 döner; Redis isteğe bağlı olduğundan yalnızca durumu raporlanır.
 * Hassas bilgi (sürüm, bağlantı adresi, hata metni) dönmez.
 */
export async function GET() {
  const started = Date.now();
  let database: "ok" | "down" = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = "down";
  }
  const redis = await redisHealth();
  const healthy = database === "ok";
  return NextResponse.json(
    { status: healthy ? "ok" : "degraded", database, redis, responseMs: Date.now() - started },
    { status: healthy ? 200 : 503 },
  );
}
