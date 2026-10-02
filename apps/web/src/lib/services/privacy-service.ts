import { randomBytes } from "node:crypto";
import { flushAuditQueue, prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { PRIVACY_TEMPLATE } from "@/lib/privacy-template";
import { hashPassword } from "@/lib/services/user-service";
import { pruneRefreshTokens } from "@/lib/services/session-service";

/**
 * KVKK: aydınlatma metni, saklama süreleri (ve süresi dolanların silinmesi), kişinin kendi verisini
 * indirmesi, müşteri ve kullanıcı anonimleştirme (silme talebi).
 */
const SINGLETON_ID = "singleton";

export type RetentionSettings = {
  auditRetentionDays: number;
  notificationRetentionDays: number;
  emailRetentionDays: number;
  errorRetentionDays: number;
};

export async function getPrivacySettings() {
  const row = await prisma.agencySettings.findUnique({ where: { id: SINGLETON_ID } });
  return {
    notice: row?.privacyNotice?.trim() ? row.privacyNotice : PRIVACY_TEMPLATE,
    isTemplate: !row?.privacyNotice?.trim(),
    retention: {
      auditRetentionDays: row?.auditRetentionDays ?? 730,
      notificationRetentionDays: row?.notificationRetentionDays ?? 180,
      emailRetentionDays: row?.emailRetentionDays ?? 90,
      errorRetentionDays: row?.errorRetentionDays ?? 90,
    } satisfies RetentionSettings,
  };
}

export async function savePrivacySettings(input: { notice: string } & RetentionSettings) {
  const data = {
    // Şablonla birebir aynıysa kaydetmeye gerek yok (boş = şablon gösterilir).
    privacyNotice: input.notice.trim() === PRIVACY_TEMPLATE.trim() ? null : input.notice,
    auditRetentionDays: input.auditRetentionDays,
    notificationRetentionDays: input.notificationRetentionDays,
    emailRetentionDays: input.emailRetentionDays,
    errorRetentionDays: input.errorRetentionDays,
  };
  const existing = await prisma.agencySettings.findUnique({ where: { id: SINGLETON_ID } });
  if (existing) {
    await prisma.agencySettings.update({ where: { id: SINGLETON_ID }, data });
  } else {
    await prisma.agencySettings.create({ data: { id: SINGLETON_ID, name: "SosyalCan Komuta Merkezi", ...data } });
  }
}

const daysAgo = (now: Date, days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

/** Süresi dolan kayıtları siler (günlük işte çalışır). Silinen satır sayılarını döner. */
export async function runRetentionCleanup(now: Date = new Date()) {
  const { retention } = await getPrivacySettings();
  const [audit, notifications, emails, errors, resetTokens, refreshTokens] = await Promise.all([
    prisma.auditLog.deleteMany({ where: { createdAt: { lt: daysAgo(now, retention.auditRetentionDays) } } }),
    prisma.notification.deleteMany({ where: { createdAt: { lt: daysAgo(now, retention.notificationRetentionDays) } } }),
    prisma.emailMessage.deleteMany({ where: { createdAt: { lt: daysAgo(now, retention.emailRetentionDays) } } }),
    prisma.errorEvent.deleteMany({ where: { lastSeenAt: { lt: daysAgo(now, retention.errorRetentionDays) } } }),
    prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: daysAgo(now, 1) } } }),
    pruneRefreshTokens(),
  ]);
  return {
    auditLogs: audit.count,
    notifications: notifications.count,
    emails: emails.count,
    errors: errors.count,
    resetTokens: resetTokens.count,
    refreshTokens,
  };
}

/** Kişinin kendi verisinin kopyası (KVKK m.11 bilgi alma hakkı). Şifre özeti, 2FA anahtarı gibi gizli alanlar hariç. */
export async function exportUserData(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      lastLoginAt: true,
      passwordChangedAt: true,
      twoFactorEnabledAt: true,
      twoFactorMethod: true,
      notificationPreferences: { select: { type: true, inApp: true, email: true } },
    },
  });
  if (!user) throw new ApiError(404, "Kullanıcı bulunamadı");
  const [tasks, shoots, appointments, comments, notifications, activity, sessions, devices] = await Promise.all([
    prisma.task.findMany({ where: { assigneeId: userId }, select: { id: true, title: true, dueDate: true, createdAt: true } }),
    prisma.shoot.findMany({ where: { assigneeId: userId }, select: { id: true, scheduledAt: true, location: true } }),
    prisma.appointment.findMany({ where: { participants: { some: { id: userId } } }, select: { id: true, title: true, startsAt: true } }),
    prisma.taskComment.findMany({ where: { authorId: userId }, select: { id: true, taskId: true, body: true, createdAt: true } }),
    prisma.notification.findMany({ where: { userId }, select: { type: true, title: true, body: true, readAt: true, createdAt: true } }),
    prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { action: true, entity: true, summary: true, ip: true, createdAt: true },
    }),
    prisma.refreshToken.findMany({ where: { userId }, select: { createdAt: true, expiresAt: true, revokedAt: true, userAgent: true, ip: true } }),
    prisma.knownDevice.findMany({ where: { userId }, select: { label: true, channel: true, firstSeenAt: true, lastSeenAt: true, lastIp: true } }),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    note: "KVKK m.11 kapsamında kişisel verilerinizin kopyasıdır. Şifre özeti ve güvenlik anahtarları güvenlik nedeniyle dahil edilmez.",
    profile: user,
    assignedTasks: tasks,
    assignedShoots: shoots,
    appointments,
    taskComments: comments,
    notifications,
    activityLog: activity,
    mobileSessions: sessions,
    loginDevices: devices,
  };
}

const anonymousTag = () => randomBytes(3).toString("hex").toUpperCase();

/** Kayıtlı metinlerde (denetim özeti, bildirim, e-posta) geçen eski adı/adresi anonim karşılığıyla değiştirir. */
async function scrubText(old: string, replacement: string) {
  if (!old || old.length < 3) return;
  // Az önceki güncellemenin denetim kaydı arka planda yazılıyor olabilir: önce bitsin, sonra temizlensin.
  await flushAuditQueue();
  await prisma.$executeRaw`UPDATE audit_logs SET summary = REPLACE(summary, ${old}, ${replacement}) WHERE summary LIKE ${`%${old}%`}`;
  await prisma.$executeRaw`UPDATE notifications SET title = REPLACE(title, ${old}, ${replacement}), body = REPLACE(body, ${old}, ${replacement}) WHERE title LIKE ${`%${old}%`} OR body LIKE ${`%${old}%`}`;
  await prisma.$executeRaw`UPDATE email_outbox SET subject = REPLACE(subject, ${old}, ${replacement}), text = REPLACE(text, ${old}, ${replacement}), "to" = REPLACE("to", ${old}, ${replacement}) WHERE subject LIKE ${`%${old}%`} OR text LIKE ${`%${old}%`} OR "to" LIKE ${`%${old}%`}`;
}

/**
 * Müşteri için KVKK silme talebi: ad, iletişim, not ve etiketler silinir, müşteri arşive alınır.
 * Finans kayıtları ve ödeme planları vergi/ticaret mevzuatı gereği saklanır (müşteriye bağlı kalır,
 * ama müşterinin adı artık anonimdir). Denetim kaydındaki eski değerler de temizlenir.
 */
export async function anonymizeCustomer(customerId: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new ApiError(404, "Müşteri bulunamadı");
  if (customer.anonymizedAt) throw new ApiError(409, "Bu müşteri zaten anonimleştirilmiş");
  const anonymous = `Anonim müşteri #${anonymousTag()}`;
  await prisma.customer.update({
    where: { id: customerId },
    data: { name: anonymous, contact: null, notes: null, tags: [], anonymizedAt: new Date(), archivedAt: customer.archivedAt ?? new Date() },
  });
  await scrubText(customer.name, anonymous);
  // Bu müşterinin kayıtlarındaki eski/yeni değerler (ad, iletişim, not) silinir.
  await flushAuditQueue();
  await prisma.$executeRaw`UPDATE audit_logs SET changes = NULL WHERE "entityId" = ${customerId}`;
  return anonymous;
}

/**
 * Ayrılan çalışan için KVKK silme talebi: ad ve e-posta anonim, hesap kapalı, şifre ve 2FA geçersiz,
 * oturumlar, bildirimler ve tercihler silinir. Yaptığı işlemlerin kaydı (kim neyi değiştirdi) anonim
 * kullanıcıya bağlı olarak kalır. Kendini ve son aktif Admin'i anonimleştiremezsin.
 */
export async function anonymizeUser(actorId: string, userId: string) {
  if (actorId === userId) throw new ApiError(400, "Kendi hesabını anonimleştiremezsin");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, "Kullanıcı bulunamadı");
  if (user.anonymizedAt) throw new ApiError(409, "Bu kullanıcı zaten anonimleştirilmiş");
  if (user.role === "ADMIN" && !user.disabledAt) {
    const otherAdmins = await prisma.user.count({ where: { role: "ADMIN", disabledAt: null, id: { not: userId } } });
    if (otherAdmins === 0) throw new ApiError(400, "Sistemde en az bir aktif Admin kalmalı");
  }
  const tag = anonymousTag();
  const anonymousName = `Silinmiş kullanıcı #${tag}`;
  const anonymousEmail = `silindi-${tag.toLowerCase()}-${user.id.slice(-6)}@anonim.local`;
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        name: anonymousName,
        email: anonymousEmail,
        passwordHash: await hashPassword(randomBytes(32).toString("base64url")),
        disabledAt: user.disabledAt ?? new Date(),
        anonymizedAt: new Date(),
        mustChangePassword: false,
        sessionVersion: { increment: 1 },
        totpSecret: null,
        totpPendingSecret: null,
        twoFactorEnabledAt: null,
        twoFactorMethod: null,
        emailOtpHash: null,
        emailOtpExpiresAt: null,
        totpLastStep: null,
        recoveryCodes: [],
      },
    }),
    prisma.refreshToken.deleteMany({ where: { userId } }),
    prisma.notification.deleteMany({ where: { userId } }),
    prisma.notificationPreference.deleteMany({ where: { userId } }),
    prisma.passwordResetToken.deleteMany({ where: { userId } }),
    prisma.knownDevice.deleteMany({ where: { userId } }),
  ]);
  await scrubText(user.email, anonymousEmail);
  await scrubText(user.name, anonymousName);
  await flushAuditQueue();
  await prisma.$executeRaw`UPDATE audit_logs SET changes = NULL WHERE "entityId" = ${userId}`;
  return anonymousName;
}
