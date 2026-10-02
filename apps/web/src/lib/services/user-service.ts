import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";
import { ApiError } from "@/lib/api-error";

const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

// Kullanıcı bulunamadığında da bcrypt karşılaştırması yapılır; böylece yanıt süresinden
// "bu e-posta kayıtlı mı" bilgisi çıkarılamaz (kullanıcı adı tahmini / enumeration).
const DUMMY_HASH = bcrypt.hashSync("sosyalcan-zamanlama-esitleme", SALT_ROUNDS);

/**
 * E-posta/şifre doğrular. Devre dışı bırakılmış (disabledAt dolu) kullanıcılar
 * giriş yapamaz. Şifre eşleşmezse veya kullanıcı yoksa null döner — hangi
 * sebeple başarısız olduğu istemciye sızdırılmaz.
 */
export async function verifyCredentials(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || user.disabledAt || !passwordMatches) {
    return null;
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    sessionVersion: user.sessionVersion,
    mustChangePassword: user.mustChangePassword,
    twoFactorEnabled: Boolean(user.twoFactorEnabledAt),
    twoFactorMethod: user.twoFactorEnabledAt ? (user.twoFactorMethod ?? "APP") : null,
  };
}

/**
 * Kullanıcının kendi şifresini değiştirmesi. Mevcut şifre doğrulanır; başarılı
 * olursa tüm oturumlar (bu cihaz dahil) kapatılır, yeniden giriş gerekir.
 */
export async function changeOwnPassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.disabledAt) {
    throw new ApiError(401, "Oturum bulunamadı");
  }
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new ApiError(400, "Mevcut şifre hatalı");
  }
  // Mevcut şifre az önce doğrulandı: aynı mı diye bir bcrypt daha çalıştırmaya gerek yok (her biri ~0,5–1 sn).
  if (newPassword === currentPassword) {
    throw new ApiError(400, "Yeni şifre eskisiyle aynı olamaz");
  }
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await hashPassword(newPassword),
        passwordChangedAt: new Date(),
        mustChangePassword: false,
        sessionVersion: { increment: 1 },
      },
    }),
    prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
}

/** Görev/çekim atama dropdown'ları için: yalnızca isim ve rol, hassas alan yok. */
export async function listAssignableUsers() {
  return prisma.user.findMany({
    where: { disabledAt: null },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
}

export async function createUser(input: {
  name: string;
  email: string;
  password: string;
  role: Role;
}) {
  const passwordHash = await hashPassword(input.password);
  return prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
    },
  });
}
