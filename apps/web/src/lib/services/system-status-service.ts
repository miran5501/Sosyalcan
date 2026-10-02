import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";
import { redisHealth } from "@/lib/redis";
import { emailMode } from "@/lib/email";
import { APP_TIME_ZONE } from "@/lib/timezone";
import packageJson from "../../../package.json";

/** Admin "Sistem Durumu" sayfasının verileri: tek bakışta sistem sağlıklı mı. */
export async function getSystemStatus() {
  const started = Date.now();
  let database: "ok" | "down" = "ok";
  let dbSize: string | null = null;
  try {
    const [row] = await prisma.$queryRaw<{ size: string }[]>`SELECT pg_size_pretty(pg_database_size(current_database())) AS size`;
    dbSize = row?.size ?? null;
  } catch {
    database = "down";
  }
  const dbLatencyMs = Date.now() - started;

  const [redis, counts, dailyJob, unresolvedErrors] = await Promise.all([
    redisHealth(),
    database === "ok"
      ? Promise.all([
          prisma.user.count({ where: { disabledAt: null } }),
          prisma.customer.count({ where: { archivedAt: null } }),
          prisma.task.count({ where: { archivedAt: null } }),
          prisma.shoot.count({ where: { archivedAt: null } }),
          prisma.transaction.count(),
          prisma.auditLog.count(),
        ]).then(([users, customers, tasks, shoots, transactions, auditLogs]) => ({ users, customers, tasks, shoots, transactions, auditLogs }))
      : Promise.resolve(null),
    prisma.jobRun.findUnique({ where: { name: "daily-reminders" } }).catch(() => null),
    prisma.errorEvent.count({ where: { resolvedAt: null } }).catch(() => 0),
  ]);

  return {
    database,
    dbLatencyMs,
    dbSize,
    redis,
    emailMode: emailMode(),
    version: packageJson.version,
    nodeVersion: process.version,
    uptimeSeconds: Math.round(process.uptime()),
    timeZone: APP_TIME_ZONE,
    counts,
    dailyJob,
    unresolvedErrors,
    lastBackup: lastBackupInfo(),
  };
}

/** Yerel yedek klasöründeki en yeni yedek (yayında yedekler başka yerde tutulur: bilinmiyor döner). */
function lastBackupInfo(): { file: string; at: Date; sizeKb: number } | null {
  try {
    const dir = join(process.cwd(), "..", "..", "_yedek", "otomatik");
    const files = readdirSync(dir).filter((f) => f.endsWith(".dump"));
    if (files.length === 0) return null;
    const latest = files
      .map((f) => ({ f, stat: statSync(join(dir, f)) }))
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)[0];
    return { file: latest.f, at: latest.stat.mtime, sizeKb: Math.round(latest.stat.size / 1024) };
  } catch {
    return null;
  }
}
