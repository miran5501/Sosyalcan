import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { auth } from "@/auth";
import { Field, OptionList, PageShell, SubmitButton, inputClass } from "@/components/form-fields";
import type { Role } from "@prisma/client";
import { EquipmentPicker } from "@/components/equipment-picker";
import { OptionSelect, PublishTargetsField } from "@/components/shoot-option-fields";
import { ApiError, requireRole } from "@/lib/api-auth";
import { createShootSchema } from "@/lib/validations/shoot";
import { createShoot } from "@/lib/services/shoot-service";
import { listCustomers } from "@/lib/services/customer-service";
import { canCreateOption, getOptionGroups } from "@/lib/services/option-service";
import { listAssignableUsers } from "@/lib/services/user-service";

async function createAction(formData: FormData) {
  "use server";
  await requireRole(["ADMIN", "OPERATIONS"]);
  let message: string | null = null;
  try {
    const data = createShootSchema.parse({
      typeId: formData.get("typeId") || undefined,
      scheduledAt: formData.get("scheduledAt"),
      location: formData.get("location") || undefined,
      brief: formData.get("brief") || undefined,
      equipment: formData.get("equipment") || undefined,
      publishTargetIds: formData.getAll("publishTargetIds").map(String),
      equipmentIds: formData.getAll("equipmentIds").map(String),
      customerId: formData.get("customerId") || undefined,
      assigneeId: formData.get("assigneeId") || undefined,
    });
    await createShoot(data);
  } catch (error) {
    // Seçenek bu arada kaldırılmış olabilir: hata ekranı yerine formda mesaj.
    if (error instanceof ApiError) message = error.message;
    else if (error instanceof ZodError) message = error.issues[0]?.message ?? "Geçersiz veri";
    else throw error;
  }
  redirect(message ? `/shoots/new?error=${encodeURIComponent(message)}` : "/shoots");
}

export default async function NewShootPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await auth();
  const user = session!.user;

  if (user.role !== "ADMIN" && user.role !== "OPERATIONS") {
    redirect("/shoots");
  }

  const { error } = await searchParams;
  const [customers, users, options] = await Promise.all([
    listCustomers({ includeArchived: false }),
    listAssignableUsers(),
    getOptionGroups(),
  ]);

  return (
    <PageShell user={user} title="Yeni Çekim">
      {error && <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <form action={createAction} className="mt-6 space-y-4 rounded-2xl border border-neutral-200 bg-white shadow-sm p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <OptionSelect id="typeId" label="Tür" options={options.shootTypes} />
          <Field id="scheduledAt" label="Tarih/Saat *">
            <input id="scheduledAt" name="scheduledAt" type="datetime-local" required className={inputClass} />
          </Field>
        </div>

        <Field id="location" label="Konum">
          <input id="location" name="location" className={inputClass} />
        </Field>
        <Field id="brief" label="Brief / Açıklama">
          <textarea id="brief" name="brief" rows={3} className={inputClass} />
        </Field>
        <PublishTargetsField platforms={options.platforms} isAdmin={user.role === "ADMIN"} />
        <EquipmentPicker categories={options.equipmentCategories} selected={[]} canQuickAdd={canCreateOption(user.role as Role, "EQUIPMENT")} />
        <Field id="equipment" label="Ekipman notu (isteğe bağlı)">
          <textarea id="equipment" name="equipment" rows={2} placeholder="Listede olmayan ya da ek açıklama" className={inputClass} />
        </Field>
        <Field id="customerId" label="Müşteri">
          <select id="customerId" name="customerId" defaultValue="" className={inputClass}>
            <OptionList items={customers} />
          </select>
        </Field>
        <Field id="assigneeId" label="Atanan Kişi">
          <select id="assigneeId" name="assigneeId" defaultValue="" className={inputClass}>
            <OptionList items={users} />
          </select>
        </Field>

        <div className="flex gap-3 pt-2">
          <SubmitButton>Kaydet</SubmitButton>
        </div>
      </form>
    </PageShell>
  );
}
