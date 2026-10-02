import { prisma } from "@/lib/prisma";

/**
 * E-posta gönderimi.
 *
 * - `SMTP_URL` tanımlıysa (ör. `smtps://kullanici:uygulama-sifresi@smtp.gmail.com:465`) e-posta gerçekten
 *   gönderilir (nodemailer).
 * - Tanımlı değilse **geliştirme modu**: e-posta gönderilmez, içeriği giden kutusuna (`email_outbox`,
 *   durum LOGGED) yazılır ve Ayarlar → Bildirimler sayfasında görülür.
 *
 * Her iki durumda da kayıt tutulur (ne zaman, kime, hangi konu, başarılı mı). Gönderim hatası asıl
 * işlemi asla bozmaz; durum FAILED ve hata metni kaydedilir.
 */
export type OutgoingEmail = {
  to: string;
  subject: string;
  text: string;
  /**
   * Şifre sıfırlama bağlantısı, doğrulama kodu gibi gizli içerik. Gerçek gönderimde (SMTP) giden kutusuna
   * içeriği yazılmaz: aksi hâlde giden kutusunu gören Admin başkasının hesabına girebilirdi.
   * Geliştirme modunda yazılır (kod/bağlantı başka yolla görülemediği için).
   */
  sensitive?: boolean;
};

const REDACTED = "[Güvenlik nedeniyle içerik saklanmadı: şifre sıfırlama bağlantısı ya da doğrulama kodu]";

export const emailMode = () => (process.env.SMTP_URL ? "smtp" : "dev");

export function appUrl(path = ""): string {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path}`;
}

type Transport = { sendMail: (message: { from: string; to: string; subject: string; text: string }) => Promise<unknown> };
const globalForMail = globalThis as unknown as { mailTransport?: Transport };

async function transport(): Promise<Transport> {
  if (!globalForMail.mailTransport) {
    const nodemailer = await import("nodemailer");
    // Yavaş/erişilemeyen SMTP sunucusu kaydetme gibi işlemleri dakikalarca bekletmesin.
    // (nodemailer bağlantı adresindeki sorgu parametrelerini ayar olarak okur; adreste verilmişse onlar geçerli.)
    const url = new URL(process.env.SMTP_URL!);
    for (const [key, ms] of [["connectionTimeout", "10000"], ["greetingTimeout", "10000"], ["socketTimeout", "20000"]]) {
      if (!url.searchParams.has(key)) url.searchParams.set(key, ms);
    }
    globalForMail.mailTransport = nodemailer.createTransport(url.toString());
  }
  return globalForMail.mailTransport;
}

export async function sendEmail(message: OutgoingEmail): Promise<"LOGGED" | "SENT" | "FAILED"> {
  const { sensitive, ...mail } = message;
  if (emailMode() === "dev") {
    await prisma.emailMessage.create({ data: { ...mail, status: "LOGGED" } });
    console.info(`[e-posta · geliştirme modu] ${mail.to} · ${mail.subject}`);
    return "LOGGED";
  }
  // Gerçek gönderimde gizli içerik kayda geçmez (konu satırında kod da olabilir).
  const record = sensitive ? { to: mail.to, subject: "SosyalCan güvenlik e-postası", text: REDACTED } : mail;
  try {
    await (await transport()).sendMail({ from: process.env.EMAIL_FROM ?? "SosyalCan <no-reply@sosyalcan.local>", ...mail });
    await prisma.emailMessage.create({ data: { ...record, status: "SENT", sentAt: new Date() } });
    return "SENT";
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    await prisma.emailMessage.create({ data: { ...record, status: "FAILED", error: text.slice(0, 500) } });
    console.error("[e-posta] gönderilemedi", text);
    return "FAILED";
  }
}

export async function listOutbox(limit = 50) {
  return prisma.emailMessage.findMany({ orderBy: { createdAt: "desc" }, take: limit });
}
