import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { CheckboxGroup, Field, OptionList, PageShell, SubmitButton, inputClass, withCurrent } from "@/components/form-fields";
import { requireRole } from "@/lib/api-auth";
import { toDateTimeLocalValue } from "@/lib/datetime";
import { orNotFound } from "@/lib/not-found";
import { archiveAppointment, getAppointmentById, updateAppointment } from "@/lib/services/appointment-service";
import { listCustomers } from "@/lib/services/customer-service";
import { listAssignableUsers } from "@/lib/services/user-service";
import { updateAppointmentSchema } from "@/lib/validations/appointment";

export default async function EditAppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const user = session!.user;
  const { id } = await params;
  const canManage = user.role === "ADMIN" || user.role === "OPERATIONS";

  const appointment = await orNotFound(getAppointmentById(id));
  const [customers, users] = await Promise.all([listCustomers({ includeArchived: false }), listAssignableUsers()]);
  // Devre dışı bırakılmış bir kullanıcı zaten katılımcıysa listede kalır (kayıtta yanlışlıkla silinmesin).
  const participantOptions = [...users, ...appointment.participants.filter((p) => !users.some((u) => u.id === p.id))];
  const editable = canManage && !appointment.archivedAt;

  async function updateAction(formData: FormData) {
    "use server";
    await requireRole(["ADMIN", "OPERATIONS"]);
    const data = updateAppointmentSchema.parse({
      title: formData.get("title"),
      startsAt: formData.get("startsAt"),
      customerId: formData.get("customerId") ?? "",
      participantIds: formData.getAll("participantIds").map(String),
    });
    await updateAppointment(id, data);
    revalidatePath("/calendar");
    redirect("/calendar");
  }

  // Silme = arşivleme (kayıtlar fiziksel silinmez).
  async function deleteAction() {
    "use server";
    await requireRole(["ADMIN", "OPERATIONS"]);
    await archiveAppointment(id);
    revalidatePath("/calendar");
    redirect("/calendar");
  }

  return (
    <PageShell user={user} title={editable ? "Randevuyu Düzenle" : "Randevu"}>
      {appointment.archivedAt && (
        <p className="mt-4 rounded-md bg-neutral-100 px-3 py-2 text-sm text-neutral-600">Bu randevu silinmiş (arşivde).</p>
      )}

      <form action={editable ? updateAction : undefined} className="mt-6 rounded-2xl border border-neutral-200 bg-white shadow-sm p-6">
        <fieldset disabled={!editable} className="space-y-4">
          <Field id="title" label="Başlık *">
            <input id="title" name="title" required defaultValue={appointment.title} className={inputClass} />
          </Field>
          <Field id="startsAt" label="Tarih / Saat *">
            <input
              id="startsAt"
              name="startsAt"
              type="datetime-local"
              required
              defaultValue={toDateTimeLocalValue(appointment.startsAt)}
              className={inputClass}
            />
          </Field>
          <Field id="customerId" label="Müşteri">
            <select id="customerId" name="customerId" defaultValue={appointment.customerId ?? ""} className={inputClass}>
              <OptionList items={withCurrent(customers, appointment.customer)} />
            </select>
          </Field>
          <CheckboxGroup
            name="participantIds"
            legend="Katılımcılar"
            items={participantOptions}
            selectedIds={appointment.participants.map((p) => p.id)}
          />
        </fieldset>

        <div className="mt-4 flex items-center gap-3">
          {editable && <SubmitButton>Kaydet</SubmitButton>}
          <Link href="/calendar" className="text-sm text-neutral-600 hover:text-neutral-900">
            ← Takvim
          </Link>
        </div>
      </form>

      {editable && (
        <form action={deleteAction} className="mt-4">
          <button type="submit" className="text-sm text-red-600 hover:text-red-800">
            Randevuyu sil
          </button>
        </form>
      )}
    </PageShell>
  );
}
