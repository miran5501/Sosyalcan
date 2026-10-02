import { randomBytes } from "node:crypto";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { FINANCE_MANAGE_ROLES, FINANCE_VIEW_ROLES, OPERATIONS_MANAGE_ROLES } from "@/lib/roles";
import { deleteObject, getObject, putObject, storageStatus } from "@/lib/storage";

/**
 * Dosya ekleri: çekime teslim dosyası / brief / görsel, finans kaydına fatura / dekont.
 *
 * Yetki kayıt türünden gelir:
 * - çekim dosyaları: herkes görür/indirir; Admin + Operasyon ekler/siler,
 * - finans dosyaları: yalnızca finansı görebilenler (Admin, Finans, Viewer) görür; Admin + Finans ekler/siler.
 *   Operasyon finans dosyasının varlığını bile göremez (404).
 *
 * Güvenlik: izinli türler listesi + dosya imzası (ilk baytlar) kontrolü, boyut sınırı, kayıt başına adet sınırı.
 * İndirmede tarayıcının dosyayı sayfa gibi çalıştırmaması için sıkı başlıklar (route'ta).
 */
export type AttachmentOwner = { kind: "shoot"; id: string } | { kind: "transaction"; id: string };

export const MAX_FILES_PER_RECORD = 20;
export const uploadMaxBytes = () => Number(process.env.UPLOAD_MAX_MB || 10) * 1024 * 1024;

/** Uzantı → içerik türü (+ varsa dosya imzası). Listede olmayan tür yüklenemez. */
const TYPES: Record<string, { mime: string; magic?: number[][] }> = {
  pdf: { mime: "application/pdf", magic: [[0x25, 0x50, 0x44, 0x46]] },
  png: { mime: "image/png", magic: [[0x89, 0x50, 0x4e, 0x47]] },
  jpg: { mime: "image/jpeg", magic: [[0xff, 0xd8, 0xff]] },
  jpeg: { mime: "image/jpeg", magic: [[0xff, 0xd8, 0xff]] },
  webp: { mime: "image/webp", magic: [[0x52, 0x49, 0x46, 0x46]] },
  gif: { mime: "image/gif", magic: [[0x47, 0x49, 0x46, 0x38]] },
  heic: { mime: "image/heic" },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", magic: [[0x50, 0x4b]] },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", magic: [[0x50, 0x4b]] },
  pptx: { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", magic: [[0x50, 0x4b]] },
  zip: { mime: "application/zip", magic: [[0x50, 0x4b]] },
  txt: { mime: "text/plain" },
  csv: { mime: "text/csv" },
  mp4: { mime: "video/mp4" },
  mov: { mime: "video/quicktime" },
};
export const ALLOWED_EXTENSIONS = Object.keys(TYPES);
/** Tarayıcıda açılabilen (indirmeden önizlenen) türler; geri kalanı her zaman indirilir. */
export const INLINE_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"]);

/** Dosya adını güvenli hâle getirir: yol parçaları ve kontrol karakterleri atılır, uzunluk sınırlanır. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "dosya";
  const cleaned = base.replace(/[\u0000-\u001f\u007f"<>|:*?]/g, "").replace(/\s+/g, " ").trim();
  return (cleaned || "dosya").slice(-150);
}

function canView(owner: AttachmentOwner["kind"], role: Role) {
  return owner === "shoot" ? true : FINANCE_VIEW_ROLES.includes(role);
}
function canManage(owner: AttachmentOwner["kind"], role: Role) {
  return owner === "shoot" ? OPERATIONS_MANAGE_ROLES.includes(role) : FINANCE_MANAGE_ROLES.includes(role);
}

const ownerWhere = (owner: AttachmentOwner) => (owner.kind === "shoot" ? { shootId: owner.id } : { transactionId: owner.id });

async function assertOwnerExists(owner: AttachmentOwner) {
  const exists =
    owner.kind === "shoot"
      ? await prisma.shoot.findFirst({ where: { id: owner.id, archivedAt: null }, select: { id: true } })
      : await prisma.transaction.findUnique({ where: { id: owner.id }, select: { id: true } });
  if (!exists) throw new ApiError(404, owner.kind === "shoot" ? "Çekim bulunamadı" : "Finans kaydı bulunamadı");
}

const PUBLIC_FIELDS = { id: true, fileName: true, contentType: true, size: true, createdAt: true, uploadedBy: { select: { name: true } } } as const;

export async function listAttachments(owner: AttachmentOwner, role: Role) {
  if (!canView(owner.kind, role)) throw new ApiError(404, "Finans kaydı bulunamadı");
  return prisma.attachment.findMany({ where: ownerWhere(owner), orderBy: { createdAt: "desc" }, select: PUBLIC_FIELDS });
}

export async function uploadAttachment(owner: AttachmentOwner, file: { name: string; bytes: Buffer }, user: { id: string; role: Role }) {
  if (!canView(owner.kind, user.role)) throw new ApiError(404, "Finans kaydı bulunamadı");
  if (!canManage(owner.kind, user.role)) throw new ApiError(403, "Bu kayda dosya ekleme yetkin yok");
  const status = storageStatus();
  if (!status.enabled) throw new ApiError(503, status.reason);
  await assertOwnerExists(owner);

  const fileName = safeFileName(file.name);
  const ext = fileName.includes(".") ? fileName.split(".").pop()!.toLowerCase() : "";
  const type = TYPES[ext];
  if (!type) throw new ApiError(400, `Bu dosya türü yüklenemez. İzin verilenler: ${ALLOWED_EXTENSIONS.join(", ")}`);
  if (file.bytes.length === 0) throw new ApiError(400, "Dosya boş");
  if (file.bytes.length > uploadMaxBytes()) throw new ApiError(400, `Dosya en fazla ${uploadMaxBytes() / 1024 / 1024} MB olabilir`);
  if (type.magic && !type.magic.some((sig) => sig.every((byte, i) => file.bytes[i] === byte))) {
    throw new ApiError(400, "Dosyanın içeriği uzantısıyla uyuşmuyor (ör. adı .pdf ama PDF değil)");
  }
  if ((await prisma.attachment.count({ where: ownerWhere(owner) })) >= MAX_FILES_PER_RECORD) {
    throw new ApiError(400, `Bir kayda en fazla ${MAX_FILES_PER_RECORD} dosya eklenebilir`);
  }

  const storageKey = `${owner.kind}/${owner.id}/${Date.now()}-${randomBytes(8).toString("hex")}.${ext}`;
  await putObject(storageKey, file.bytes, type.mime);
  try {
    return await prisma.attachment.create({
      data: { ...ownerWhere(owner), fileName, contentType: type.mime, size: file.bytes.length, storageKey, uploadedById: user.id },
      select: PUBLIC_FIELDS,
    });
  } catch (error) {
    await deleteObject(storageKey).catch(() => undefined); // kayıt oluşmadıysa yetim dosya kalmasın
    throw error;
  }
}

async function getVisible(id: string, role: Role) {
  const attachment = await prisma.attachment.findUnique({ where: { id } });
  const kind = attachment?.shootId ? "shoot" : "transaction";
  if (!attachment || !canView(kind, role)) throw new ApiError(404, "Dosya bulunamadı");
  return { attachment, kind } as const;
}

export async function downloadAttachment(id: string, role: Role) {
  const { attachment } = await getVisible(id, role);
  const status = storageStatus();
  if (!status.enabled) throw new ApiError(503, status.reason);
  try {
    return { attachment, bytes: await getObject(attachment.storageKey) };
  } catch {
    throw new ApiError(404, "Dosya depolamada bulunamadı");
  }
}

export async function deleteAttachment(id: string, role: Role) {
  const { attachment, kind } = await getVisible(id, role);
  if (!canManage(kind, role)) throw new ApiError(403, "Bu dosyayı silme yetkin yok");
  await prisma.attachment.delete({ where: { id } });
  await deleteObject(attachment.storageKey).catch((error) => console.error("[dosya] depolamadan silinemedi", attachment.storageKey, error));
}

/** Sayfalar için: dosya listesi + depolama durumu (Attachments bileşeninin beklediği biçimde). */
export async function attachmentsForPage(owner: AttachmentOwner, role: Role) {
  const list = await listAttachments(owner, role);
  const status = storageStatus();
  return {
    initial: list.map((a) => ({ ...a, createdAt: a.createdAt.toISOString(), uploadedBy: a.uploadedBy?.name ?? null })),
    storageReason: status.enabled ? null : status.reason,
    maxMb: uploadMaxBytes() / 1024 / 1024,
  };
}
