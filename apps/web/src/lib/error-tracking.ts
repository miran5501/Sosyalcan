import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * Hata takibi: sunucuda, tarayıcıda ve mobil uygulamada yakalanan beklenmedik hatalar tek yerde
 * (Ayarlar → Sistem Durumu). Aynı hata tekrar edince yeni satır açılmaz, sayaç artar.
 * Yeni (ya da "çözüldü" denip yeniden çıkan) bir hata Admin'lere uygulama içi bildirim olarak düşer;
 * ERROR_WEBHOOK_URL tanımlıysa (Slack / Discord / Teams gelen webhook'u) oraya da mesaj gider.
 *
 * Hata kaydı asıl işlemi asla bozmaz: kendi hatası yutulur ve konsola yazılır.
 */
export type ErrorSource = "server" | "web" | "mobile";
export type ErrorReport = { source: ErrorSource; message: string; path?: string | null; digest?: string | null; stack?: string | null };

// Sayılar ve kimlikler aynı hatanın farklı örneklerini ayırmasın (ör. "id cmx12… bulunamadı").
const normalize = (message: string) => message.replace(/\b[a-z0-9]{20,}\b/gi, "<id>").replace(/\d+/g, "<n>").slice(0, 300);
const normalizePath = (path?: string | null) => (path ?? "").replace(/\/[a-z0-9]{20,}(?=\/|$)/gi, "/<id>").split("?")[0];

export function fingerprintOf(report: ErrorReport): string {
  return createHash("sha1").update(`${report.source}|${normalize(report.message)}|${normalizePath(report.path)}`).digest("hex");
}

async function postWebhook(text: string) {
  const url = process.env.ERROR_WEBHOOK_URL;
  if (!url) return;
  try {
    // Slack "text", Discord "content" alanını okur: ikisi birden gönderilir.
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, content: text }),
      signal: AbortSignal.timeout(3000),
    });
  } catch (error) {
    console.error("[hata takibi] webhook gönderilemedi", error instanceof Error ? error.message : error);
  }
}

export async function recordError(report: ErrorReport): Promise<void> {
  try {
    const fingerprint = fingerprintOf(report);
    const data = {
      source: report.source,
      message: report.message.slice(0, 500),
      path: report.path?.slice(0, 300) ?? null,
      digest: report.digest?.slice(0, 100) ?? null,
      stack: report.stack?.slice(0, 4000) ?? null,
    };
    const existing = await prisma.errorEvent.findUnique({ where: { fingerprint } });
    const isNew = !existing || existing.resolvedAt !== null;
    if (existing) {
      await prisma.errorEvent.update({
        where: { fingerprint },
        data: { count: { increment: 1 }, lastSeenAt: new Date(), resolvedAt: null, digest: data.digest, stack: data.stack ?? existing.stack },
      });
    } else {
      await prisma.errorEvent.create({ data: { ...data, fingerprint } });
    }
    if (isNew) {
      const where = { server: "Sunucu", web: "Tarayıcı", mobile: "Mobil" }[report.source];
      const title = `Yeni hata (${where}): ${data.message.slice(0, 120)}`;
      const { notify } = await import("@/lib/services/notification-service");
      const admins = await prisma.user.findMany({ where: { role: "ADMIN", disabledAt: null }, select: { id: true } });
      await notify({ type: "SYSTEM_ERROR", userIds: admins.map((a) => a.id), title, body: data.path ?? undefined, link: "/settings/system" });
      await postWebhook(`⚠️ SosyalCan — ${title}${data.path ? ` (${data.path})` : ""}`);
    }
  } catch (error) {
    console.error("[hata takibi] kaydedilemedi", error);
  }
}

export async function listErrors(limit = 50) {
  return prisma.errorEvent.findMany({ orderBy: [{ resolvedAt: { sort: "asc", nulls: "first" } }, { lastSeenAt: "desc" }], take: limit });
}

export async function resolveError(id: string) {
  await prisma.errorEvent.update({ where: { id }, data: { resolvedAt: new Date() } });
}
