import type { OptionKind, Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cached } from "@/lib/cache";
import { ApiError } from "@/lib/api-error";
import { OPTION_KIND_CONFIG } from "@/lib/options";
import { foldCase } from "@/lib/tags";
import type { CreateOptionInput, UpdateOptionInput } from "@/lib/validations/option";

const optionSelect = {
  id: true,
  kind: true,
  label: true,
  color: true,
  isDone: true,
  sortOrder: true,
  archivedAt: true,
  parentId: true,
  parent: { select: { id: true, label: true, archivedAt: true } },
} as const;

const ORDER: Prisma.OptionItemOrderByWithRelationInput[] = [{ sortOrder: "asc" }, { createdAt: "asc" }];

/** Seçenekleri sıralı döndürür. Varsayılan: yalnızca kullanılabilir (arşivlenmemiş) olanlar. */
export async function listOptions(params: { kind?: OptionKind; includeArchived?: boolean } = {}) {
  // Neredeyse her form ve sayfa bu listeleri okur; değişince Prisma katmanı önbelleği temizler.
  return cached("options", `list:${params.kind ?? "all"}:${params.includeArchived ? "archived" : "active"}`, 60, () =>
    prisma.optionItem.findMany({
      where: {
        ...(params.kind ? { kind: params.kind } : {}),
        ...(params.includeArchived ? {} : { archivedAt: null }),
      },
      select: optionSelect,
      orderBy: [{ kind: "asc" }, ...ORDER],
    }),
  );
}

/**
 * Formlar ve yönetim sayfası için gruplanmış seçenekler: platformlar paylaşım türleriyle birlikte.
 * `includeArchived` yalnızca yönetim sayfasında kullanılır (kaldırılanlar geri alınabilsin diye).
 */
export async function getOptionGroups(includeArchived = false) {
  const all = await listOptions({ includeArchived });
  const byKind = (kind: OptionKind) => all.filter((o) => o.kind === kind);
  const formats = byKind("POST_FORMAT");
  const equipment = byKind("EQUIPMENT");
  return {
    taskStatuses: byKind("TASK_STATUS"),
    shootTypes: byKind("SHOOT_TYPE"),
    deliveryStatuses: byKind("DELIVERY_STATUS"),
    platforms: byKind("PLATFORM").map((p) => ({ ...p, formats: formats.filter((f) => f.parentId === p.id) })),
    equipmentCategories: byKind("EQUIPMENT_CATEGORY").map((c) => ({ ...c, items: equipment.filter((e) => e.parentId === c.id) })),
    financeCategories: byKind("FINANCE_CATEGORY"),
    paymentMethods: byKind("PAYMENT_METHOD"),
    deliveryChecklist: byKind("DELIVERY_CHECKLIST"),
  };
}

async function getOption(id: string) {
  const option = await prisma.optionItem.findUnique({ where: { id }, select: optionSelect });
  if (!option) {
    throw new ApiError(404, "Seçenek bulunamadı");
  }
  return option;
}

/** Aynı listede (aynı tür ve aynı üst platform) aynı adla ikinci bir aktif seçenek olamaz. */
async function assertUniqueLabel(kind: OptionKind, parentId: string | null, label: string, exceptId?: string) {
  const siblings = await prisma.optionItem.findMany({
    where: { kind, parentId, archivedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { label: true },
  });
  const wanted = foldCase(label.trim());
  if (siblings.some((s) => foldCase(s.label.trim()) === wanted)) {
    throw new ApiError(409, `"${label.trim()}" zaten listede var`);
  }
}

/**
 * Seçenek ekleyebilir mi: Admin her listeye; bazı listelere (ekipman, finans kategorisi) ilgili
 * formu kullanan roller de formdan hızlı ekleme yapabilir (bkz. OPTION_KIND_CONFIG.quickAddRoles).
 */
export function canCreateOption(role: Role, kind: OptionKind) {
  return role === "ADMIN" || (OPTION_KIND_CONFIG[kind].quickAddRoles ?? []).includes(role);
}

export async function createOption(input: CreateOptionInput) {
  const config = OPTION_KIND_CONFIG[input.kind];
  let parentId: string | null = null;
  if (config.parentKind) {
    const parentName = OPTION_KIND_CONFIG[config.parentKind].single;
    if (!input.parentId) {
      throw new ApiError(400, `${capitalize(config.single)} bir ${parentName} altına eklenmeli`);
    }
    const parent = await getOption(input.parentId);
    if (parent.kind !== config.parentKind) {
      throw new ApiError(400, `${capitalize(config.single)} yalnızca bir ${parentName} altına eklenebilir`);
    }
    if (parent.archivedAt) {
      throw new ApiError(409, `Kaldırılmış bir ${parentName} altına ${config.single} eklenemez`);
    }
    parentId = parent.id;
  } else if (input.parentId) {
    throw new ApiError(400, "Bu seçenek türü bir üst seçenek alamaz");
  }

  await assertUniqueLabel(input.kind, parentId, input.label);
  const last = await prisma.optionItem.aggregate({ where: { kind: input.kind, parentId }, _max: { sortOrder: true } });

  return prisma.optionItem.create({
    data: {
      kind: input.kind,
      label: input.label.trim(),
      // Renk yalnızca durum listelerinde rozet olarak kullanılır.
      color: config.hasColor ? (input.color ?? "neutral") : null,
      isDone: config.hasDoneFlag ? (input.isDone ?? false) : false,
      parentId,
      sortOrder: (last._max.sortOrder ?? -1) + 1,
    },
    select: optionSelect,
  });
}

export async function updateOption(id: string, input: UpdateOptionInput) {
  const option = await getOption(id);
  if (input.label !== undefined) {
    await assertUniqueLabel(option.kind, option.parentId, input.label, id);
  }
  return prisma.optionItem.update({
    where: { id },
    data: {
      ...(input.label !== undefined ? { label: input.label.trim() } : {}),
      ...(input.color !== undefined && OPTION_KIND_CONFIG[option.kind].hasColor ? { color: input.color } : {}),
      ...(input.isDone !== undefined && OPTION_KIND_CONFIG[option.kind].hasDoneFlag ? { isDone: input.isDone } : {}),
    },
    select: optionSelect,
  });
}

/** Seçeneği aynı listede bir yukarı/aşağı taşır (sıra numaraları 0..n olarak yeniden yazılır). */
export async function moveOption(id: string, direction: "up" | "down") {
  const option = await getOption(id);
  return prisma.$transaction(async (tx) => {
    const siblings = await tx.optionItem.findMany({
      where: { kind: option.kind, parentId: option.parentId, archivedAt: null },
      orderBy: ORDER,
      select: { id: true },
    });
    const ids = siblings.map((s) => s.id);
    const from = ids.indexOf(id);
    const to = direction === "up" ? from - 1 : from + 1;
    if (from === -1 || to < 0 || to >= ids.length) return; // en üstte/altta ya da arşivli: değişiklik yok
    [ids[from], ids[to]] = [ids[to], ids[from]];
    for (const [index, siblingId] of ids.entries()) {
      await tx.optionItem.update({ where: { id: siblingId }, data: { sortOrder: index } });
    }
  });
}

/**
 * Seçeneği kaldırır: silinmez, arşivlenir. Eski çekimlerde görünmeye devam eder ama yeni seçimde çıkmaz.
 * Görev durumu, çekim türü ve teslim durumu listelerinde en az bir seçenek kalmalı (her kayıt birini taşır).
 */
export async function archiveOption(id: string) {
  const option = await getOption(id);
  if (option.archivedAt) return option;
  if (OPTION_KIND_CONFIG[option.kind].keepOne) {
    const active = await prisma.optionItem.count({ where: { kind: option.kind, archivedAt: null } });
    if (active <= 1) {
      throw new ApiError(409, `En az bir ${OPTION_KIND_CONFIG[option.kind].single} kalmalı`);
    }
  }
  return prisma.optionItem.update({ where: { id }, data: { archivedAt: new Date() }, select: optionSelect });
}

export async function restoreOption(id: string) {
  const option = await getOption(id);
  if (!option.archivedAt) return option;
  if (option.parent?.archivedAt) {
    const parentKind = OPTION_KIND_CONFIG[option.kind].parentKind;
    throw new ApiError(409, `Önce üstteki ${parentKind ? OPTION_KIND_CONFIG[parentKind].single : "seçeneği"} geri al`);
  }
  await assertUniqueLabel(option.kind, option.parentId, option.label, id);
  return prisma.optionItem.update({ where: { id }, data: { archivedAt: null }, select: optionSelect });
}

/**
 * Çekim formundan gelen seçenek kimliğini doğrular. Kaldırılmış bir seçenek yalnızca çekimde zaten
 * seçiliyse kabul edilir (eski kayıt düzenlenirken değeri kaybolmasın).
 */
export async function assertSelectable(id: string, kinds: OptionKind[], keepIds: string[] = []) {
  const option = await prisma.optionItem.findUnique({
    where: { id },
    select: { id: true, kind: true, archivedAt: true, parent: { select: { archivedAt: true } } },
  });
  if (!option || !kinds.includes(option.kind)) {
    throw new ApiError(400, "Geçersiz seçenek seçildi");
  }
  const archived = option.archivedAt || option.parent?.archivedAt;
  if (archived && !keepIds.includes(id)) {
    throw new ApiError(400, "Seçilen seçenek kaldırılmış; listeden başka bir seçenek seçin");
  }
  return option.id;
}

/** Listenin ilk aktif seçeneği (yeni çekimin varsayılan türü/durumu). Liste boşsa 400. */
export async function firstActiveOption(kind: "SHOOT_TYPE" | "DELIVERY_STATUS" | "TASK_STATUS") {
  const option = await prisma.optionItem.findFirst({ where: { kind, archivedAt: null }, orderBy: ORDER, select: { id: true } });
  if (!option) {
    throw new ApiError(400, `Önce Seçenek Listeleri sayfasından bir ${OPTION_KIND_CONFIG[kind].single} ekleyin`);
  }
  return option.id;
}

const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase("tr-TR") + text.slice(1);
