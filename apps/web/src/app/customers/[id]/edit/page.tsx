import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Nav } from "@/components/nav";
import { requireRole } from "@/lib/api-auth";
import { updateCustomerSchema } from "@/lib/validations/customer";
import { getCustomerById, updateCustomer } from "@/lib/services/customer-service";

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const user = session!.user;
  const { id } = await params;
  const customer = await getCustomerById(id);
  const canManage = user.role === "ADMIN" || user.role === "OPERATIONS";

  async function updateAction(formData: FormData) {
    "use server";
    await requireRole(["ADMIN", "OPERATIONS"]);
    const data = updateCustomerSchema.parse({
      name: formData.get("name"),
      contact: formData.get("contact") || undefined,
      notes: formData.get("notes") || undefined,
      tags: formData.get("tags") ?? "",
    });
    await updateCustomer(id, data);
    redirect("/customers");
  }

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 lg:pl-64 print:pl-0">
      <Nav userName={user.name} userRole={user.role} />
      <main className="animate-fade-up mx-auto w-full max-w-lg flex-1 px-4 py-8">
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">Müşteriyi Düzenle</h1>

        <form
          action={canManage ? updateAction : undefined}
          className="mt-6 space-y-4 rounded-2xl border border-neutral-200 bg-white shadow-sm p-6"
        >
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-neutral-700">
              Ad *
            </label>
            <input
              id="name"
              name="name"
              required
              defaultValue={customer.name}
              disabled={!canManage}
              className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-neutral-100"
            />
          </div>
          <div>
            <label htmlFor="contact" className="block text-sm font-medium text-neutral-700">
              İletişim
            </label>
            <input
              id="contact"
              name="contact"
              defaultValue={customer.contact ?? ""}
              disabled={!canManage}
              className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-neutral-100"
            />
          </div>
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-neutral-700">
              Notlar
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              defaultValue={customer.notes ?? ""}
              disabled={!canManage}
              className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-neutral-100"
            />
          </div>

          <div>
            <label htmlFor="tags" className="block text-sm font-medium text-neutral-700">
              Etiketler
            </label>
            <input
              id="tags"
              name="tags"
              placeholder="Virgülle ayır: vip, restoran, aylık"
              defaultValue={customer.tags.join(", ")}
              disabled={!canManage}
              className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-neutral-100"
            />
          </div>

          {canManage && (
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-on-brand hover:bg-brand-700"
              >
                Kaydet
              </button>
            </div>
          )}
        </form>
      </main>
    </div>
  );
}
