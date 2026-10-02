import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { CheckboxGroup, Field, OptionList, PageShell, SubmitButton, inputClass } from "@/components/form-fields";
import { requireRole } from "@/lib/api-auth";
import { createAppointmentSchema } from "@/lib/validations/appointment";
import { createAppointment } from "@/lib/services/appointment-service";
import { listCustomers } from "@/lib/services/customer-service";
import { listAssignableUsers } from "@/lib/services/user-service";

async function createAction(formData: FormData) {
  "use server";
  await requireRole(["ADMIN", "OPERATIONS"]);
  const data = createAppointmentSchema.parse({
    title: formData.get("title"),
    startsAt: formData.get("startsAt"),
    customerId: formData.get("customerId") || undefined,
    participantIds: formData.getAll("participantIds").map(String),
  });
  await createAppointment(data);
  redirect("/calendar");
}

export default async function NewAppointmentPage() {
  const session = await auth();
  const user = session!.user;

  if (user.role !== "ADMIN" && user.role !== "OPERATIONS") {
    redirect("/calendar");
  }

  const [customers, users] = await Promise.all([listCustomers({ includeArchived: false }), listAssignableUsers()]);

  return (
    <PageShell user={user} title="Yeni Randevu">
      <form action={createAction} className="mt-6 space-y-4 rounded-2xl border border-neutral-200 bg-white shadow-sm p-6">
        <Field id="title" label="Başlık *">
          <input id="title" name="title" required placeholder="Örn: Müşteri görüşmesi" className={inputClass} />
        </Field>
        <Field id="startsAt" label="Tarih/Saat *">
          <input id="startsAt" name="startsAt" type="datetime-local" required className={inputClass} />
        </Field>
        <Field id="customerId" label="Müşteri">
          <select id="customerId" name="customerId" defaultValue="" className={inputClass}>
            <OptionList items={customers} />
          </select>
        </Field>
        <CheckboxGroup name="participantIds" legend="Katılımcılar" items={users} />

        <div className="flex gap-3 pt-2">
          <SubmitButton>Kaydet</SubmitButton>
        </div>
      </form>
    </PageShell>
  );
}
