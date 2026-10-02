import { prisma } from "@/lib/prisma";
import { currentUserId } from "@/lib/api-auth";
import { notify } from "@/lib/services/notification-service";
import { ApiError } from "@/lib/api-error";
import type { CreateAppointmentInput, UpdateAppointmentInput } from "@/lib/validations/appointment";

const appointmentInclude = {
  customer: { select: { id: true, name: true } },
  participants: { select: { id: true, name: true }, orderBy: { name: "asc" } },
} as const;

export async function listAppointments(params: { from?: Date; to?: Date } = {}) {
  return prisma.appointment.findMany({
    where: {
      archivedAt: null,
      ...(params.from || params.to
        ? {
            startsAt: {
              ...(params.from ? { gte: params.from } : {}),
              ...(params.to ? { lte: params.to } : {}),
            },
          }
        : {}),
    },
    include: appointmentInclude,
    orderBy: { startsAt: "asc" },
  });
}

export async function getAppointmentById(id: string) {
  const appointment = await prisma.appointment.findUnique({ where: { id }, include: appointmentInclude });
  if (!appointment) {
    throw new ApiError(404, "Randevu bulunamadı");
  }
  return appointment;
}

/** Katılımcı kimliklerini tekrarsız yapar ve hepsinin gerçek kullanıcı olduğunu doğrular (yoksa 400). */
async function resolveParticipants(ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const found = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true } });
  if (found.length !== unique.length) {
    throw new ApiError(400, "Geçersiz katılımcı seçildi");
  }
  return unique.map((id) => ({ id }));
}

/** Randevuya yeni eklenen katılımcılara bildirim. */
async function notifyInvited(appointment: { id: string; title: string; startsAt: Date; customer: { name: string } | null }, userIds: string[]) {
  if (userIds.length === 0) return;
  const when = appointment.startsAt.toLocaleString("tr-TR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  await notify({
    type: "APPOINTMENT_INVITED",
    userIds,
    exceptUserId: await currentUserId(),
    title: `Randevuya eklendin: ${appointment.title} · ${when}`,
    body: appointment.customer?.name,
    link: `/calendar/${appointment.id}/edit`,
  });
}

export async function createAppointment(input: CreateAppointmentInput) {
  const participants = await resolveParticipants(input.participantIds ?? []);
  const appointment = await prisma.appointment.create({
    data: {
      title: input.title,
      startsAt: new Date(input.startsAt),
      customerId: input.customerId || undefined,
      ...(participants.length > 0 ? { participants: { connect: participants } } : {}),
    },
    include: appointmentInclude,
  });
  await notifyInvited(appointment, participants.map((p) => p.id));
  return appointment;
}

export async function updateAppointment(id: string, input: UpdateAppointmentInput) {
  const current = await getAppointmentById(id);
  const participants = input.participantIds !== undefined ? await resolveParticipants(input.participantIds) : undefined;
  const appointment = await prisma.appointment.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.startsAt !== undefined ? { startsAt: new Date(input.startsAt) } : {}),
      ...(input.customerId !== undefined ? { customerId: input.customerId || null } : {}),
      ...(participants !== undefined ? { participants: { set: participants } } : {}),
    },
    include: appointmentInclude,
  });
  if (participants) {
    const before = new Set(current.participants.map((p) => p.id));
    await notifyInvited(appointment, participants.map((p) => p.id).filter((pid) => !before.has(pid)));
  }
  return appointment;
}

export async function archiveAppointment(id: string) {
  await getAppointmentById(id);
  return prisma.appointment.update({ where: { id }, data: { archivedAt: new Date() } });
}
