import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { hashPassword } from "@/lib/services/user-service";
import type { CreateUserInput, UpdateUserInput } from "@/lib/validations/settings";

const PUBLIC_USER_FIELDS = {
  id: true,
  name: true,
  email: true,
  role: true,
  disabledAt: true,
  mustChangePassword: true,
  twoFactorEnabledAt: true,
  anonymizedAt: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

/** Ayarlar > Kullanıcı yönetimi: devre dışı olanlar dahil tüm kullanıcılar (passwordHash asla dönmez). */
export async function listAllUsers() {
  return prisma.user.findMany({
    select: PUBLIC_USER_FIELDS,
    orderBy: [{ disabledAt: "asc" }, { name: "asc" }],
  });
}

export async function createUserByAdmin(input: CreateUserInput) {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new ApiError(409, "Bu e-posta ile kayıtlı bir kullanıcı zaten var");
  }
  return prisma.user.create({
    data: {
      name: input.name,
      email,
      passwordHash: await hashPassword(input.password),
      role: input.role,
      // Şifreyi admin belirledi: kişi ilk girişte kendi şifresini koymadan devam edemez.
      mustChangePassword: true,
    },
    select: PUBLIC_USER_FIELDS,
  });
}

/**
 * Kullanıcı güncelleme. İki güvenlik kuralı:
 *  - Admin kendi rolünü düşüremez / kendini devre dışı bırakamaz (kilitlenme).
 *  - Sistemde her zaman en az bir aktif Admin kalmalı.
 */
export async function updateUserByAdmin(actorId: string, targetId: string, input: UpdateUserInput) {
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) {
    throw new ApiError(404, "Kullanıcı bulunamadı");
  }

  const isSelf = actorId === targetId;
  const losesAdmin =
    target.role === "ADMIN" &&
    !target.disabledAt &&
    ((input.role !== undefined && input.role !== "ADMIN") || input.disabled === true);

  if (isSelf && losesAdmin) {
    throw new ApiError(400, "Kendi Admin yetkinizi kaldıramaz veya hesabınızı devre dışı bırakamazsınız");
  }
  if (losesAdmin) {
    const otherActiveAdmins = await prisma.user.count({
      where: { role: "ADMIN", disabledAt: null, id: { not: targetId } },
    });
    if (otherActiveAdmins === 0) {
      throw new ApiError(400, "Sistemde en az bir aktif Admin kalmalı");
    }
  }

  // Şifre sıfırlanınca ya da hesap kapatılınca o kullanıcının açık tüm oturumları düşer.
  const endSessions = input.password !== undefined || input.disabled === true;
  const [user] = await prisma.$transaction([
    prisma.user.update({
      where: { id: targetId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.disabled !== undefined ? { disabledAt: input.disabled ? new Date() : null } : {}),
        ...(input.password !== undefined
          ? { passwordHash: await hashPassword(input.password), passwordChangedAt: new Date(), mustChangePassword: true }
          : {}),
        ...(endSessions ? { sessionVersion: { increment: 1 } } : {}),
      },
      select: PUBLIC_USER_FIELDS,
    }),
    prisma.refreshToken.updateMany({
      where: endSessions ? { userId: targetId, revokedAt: null } : { id: "__hicbiri__" },
      data: { revokedAt: new Date() },
    }),
  ]);
  return user;
}
