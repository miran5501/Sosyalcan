import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ZodError } from "zod";
import { Field, OptionList, PageShell, SubmitButton, inputClass, withCurrent } from "@/components/form-fields";
import type { Role } from "@prisma/client";
import { EquipmentPicker } from "@/components/equipment-picker";
import { OptionSelect, PublishTargetsField } from "@/components/shoot-option-fields";
import { ApiError, requireRole } from "@/lib/api-auth";
import { toDateTimeLocalValue } from "@/lib/datetime";
import { orNotFound } from "@/lib/not-found";
import { listCustomers } from "@/lib/services/customer-service";
import { canCreateOption, getOptionGroups } from "@/lib/services/option-service";
import { addChecklistItem, getShootById, removeChecklistItem, setChecklistItemDone, updateShoot } from "@/lib/services/shoot-service";
import { ShootChecklist } from "@/components/shoot-checklist";
import { Attachments } from "@/components/attachments";
import { attachmentsForPage } from "@/lib/services/attachment-service";
import { listAssignableUsers } from "@/lib/services/user-service";
import { checklistItemSchema, updateShootSchema } from "@/lib/validations/shoot";

/**
 * Kontrol listesi işlemleri: hata olursa aynı sayfada mesaj, olmazsa sayfa yerinde yenilenir.
 * Modül seviyesinde durmalı: server action'lar bileşen içindeki fonksiyonları yakalayamaz.
 */
async function runChecklistAction(id: string, run: () => Promise<unknown>) {
  let message: string | null = null;
  try {
    await run();
  } catch (error) {
    if (error instanceof ApiError) message = error.message;
    else if (error instanceof ZodError) message = error.issues[0]?.message ?? "Geçersiz veri";
    else throw error;
  }
  revalidatePath(`/shoots/${id}/edit`);
  revalidatePath("/shoots");
  if (message) redirect(`/shoots/${id}/edit?error=${encodeURIComponent(message)}`);
}

export default async function EditShootPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  const user = session!.user;
  const { id } = await params;
  const canManage = user.role === "ADMIN" || user.role === "OPERATIONS";

  const shoot = await orNotFound(getShootById(id));
  const [customers, users, options, files] = await Promise.all([
    listCustomers({ includeArchived: false }),
    listAssignableUsers(),
    getOptionGroups(),
    attachmentsForPage({ kind: "shoot", id: shoot.id }, user.role as Role),
  ]);
  const editable = canManage && !shoot.archivedAt;
  const { error } = await searchParams;

  async function updateAction(formData: FormData) {
    "use server";
    await requireRole(["ADMIN", "OPERATIONS"]);
    let message: string | null = null;
    try {
      const data = updateShootSchema.parse({
        typeId: formData.get("typeId"),
        scheduledAt: formData.get("scheduledAt"),
        location: formData.get("location") ?? "",
        brief: formData.get("brief") ?? "",
        equipment: formData.get("equipment") ?? "",
        publishTargetIds: formData.getAll("publishTargetIds").map(String),
        equipmentIds: formData.getAll("equipmentIds").map(String),
        deliveryStatusId: formData.get("deliveryStatusId"),
        deliveryLink: formData.get("deliveryLink") ?? "",
        customerId: formData.get("customerId") ?? "",
        assigneeId: formData.get("assigneeId") ?? "",
        revisionCount: formData.get("revisionCount") ?? 0,
      });
      await updateShoot(id, data);
    } catch (error) {
      if (error instanceof ApiError) message = error.message;
      else if (error instanceof ZodError) message = error.issues[0]?.message ?? "Geçersiz veri";
      else throw error;
    }
    revalidatePath("/shoots");
    redirect(message ? `/shoots/${id}/edit?error=${encodeURIComponent(message)}` : "/shoots");
  }

  async function toggleItemAction(formData: FormData) {
    "use server";
    const session = await requireRole(["ADMIN", "OPERATIONS"]);
    await runChecklistAction(id, () =>
      setChecklistItemDone(id, String(formData.get("itemId")), formData.get("done") === "true", session.user.id),
    );
  }

  async function addItemAction(formData: FormData) {
    "use server";
    await requireRole(["ADMIN", "OPERATIONS"]);
    await runChecklistAction(id, () => addChecklistItem(id, checklistItemSchema.parse({ label: formData.get("label") }).label));
  }

  async function removeItemAction(formData: FormData) {
    "use server";
    await requireRole(["ADMIN", "OPERATIONS"]);
    await runChecklistAction(id, () => removeChecklistItem(id, String(formData.get("itemId"))));
  }

  return (
    <PageShell user={user} title={editable ? "Çekimi Düzenle" : "Çekim"}>
      {shoot.archivedAt && (
        <p className="mt-4 rounded-md bg-neutral-100 px-3 py-2 text-sm text-neutral-600">Bu çekim arşivlenmiş; değiştirilemez.</p>
      )}
      {error && <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <form action={editable ? updateAction : undefined} className="mt-6 rounded-2xl border border-neutral-200 bg-white shadow-sm p-6">
        <fieldset disabled={!editable} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <OptionSelect id="typeId" label="Tür" options={options.shootTypes} current={shoot.type} />
            <Field id="scheduledAt" label="Tarih / Saat *">
              <input
                id="scheduledAt"
                name="scheduledAt"
                type="datetime-local"
                required
                defaultValue={toDateTimeLocalValue(shoot.scheduledAt)}
                className={inputClass}
              />
            </Field>
          </div>

          <Field id="location" label="Konum">
            <input id="location" name="location" defaultValue={shoot.location ?? ""} className={inputClass} />
          </Field>
          <Field id="brief" label="Brief / Açıklama">
            <textarea id="brief" name="brief" rows={3} defaultValue={shoot.brief ?? ""} className={inputClass} />
          </Field>
          <PublishTargetsField platforms={options.platforms} selected={shoot.publishTargets} isAdmin={user.role === "ADMIN"} />
          <EquipmentPicker categories={options.equipmentCategories} selected={shoot.equipmentItems} canQuickAdd={canCreateOption(user.role as Role, "EQUIPMENT")} disabled={!editable} />
          <Field id="equipment" label="Ekipman notu (isteğe bağlı)">
            <textarea id="equipment" name="equipment" rows={2} placeholder="Listede olmayan ya da ek açıklama" defaultValue={shoot.equipment ?? ""} className={inputClass} />
          </Field>
          <Field id="customerId" label="Müşteri">
            <select id="customerId" name="customerId" defaultValue={shoot.customerId ?? ""} className={inputClass}>
              <OptionList items={withCurrent(customers, shoot.customer)} />
            </select>
          </Field>
          <Field id="assigneeId" label="Atanan Kişi">
            <select id="assigneeId" name="assigneeId" defaultValue={shoot.assigneeId ?? ""} className={inputClass}>
              <OptionList items={withCurrent(users, shoot.assignee)} />
            </select>
          </Field>

          <div className="border-t border-neutral-100 pt-4">
            <p className="text-sm font-semibold text-neutral-900">Teslim</p>
            <div className="mt-3 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_10rem]">
                <OptionSelect id="deliveryStatusId" label="Teslim Durumu" options={options.deliveryStatuses} current={shoot.deliveryStatus} />
                <Field id="revisionCount" label="Revizyon sayısı">
                  <input
                    id="revisionCount"
                    name="revisionCount"
                    type="number"
                    min={0}
                    max={99}
                    defaultValue={shoot.revisionCount}
                    className={inputClass}
                  />
                </Field>
              </div>
              <Field id="deliveryLink" label="Teslim Linki (Drive vb.)">
                <input
                  id="deliveryLink"
                  name="deliveryLink"
                  type="url"
                  placeholder="https://"
                  defaultValue={shoot.deliveryLink ?? ""}
                  className={inputClass}
                />
              </Field>
            </div>
          </div>
        </fieldset>

        <div className="mt-4 flex items-center gap-3">
          {editable && <SubmitButton>Kaydet</SubmitButton>}
          <Link href="/shoots" className="text-sm text-neutral-600 hover:text-neutral-900">
            ← Çekimler
          </Link>
        </div>
      </form>

      <ShootChecklist
        items={shoot.checklist}
        editable={editable}
        toggleAction={toggleItemAction}
        addAction={addItemAction}
        removeAction={removeItemAction}
      />

      <Attachments
        owner={{ shootId: shoot.id }}
        {...files}
        canManage={editable}
        hint="Büyük video dosyaları için teslim bağlantısını kullan."
      />
    </PageShell>
  );
}
