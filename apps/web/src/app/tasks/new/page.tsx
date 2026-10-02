import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Nav } from "@/components/nav";
import { ZodError } from "zod";
import { PublishTargetsField } from "@/components/shoot-option-fields";
import { ApiError, requireRole } from "@/lib/api-auth";
import { createTaskSchema } from "@/lib/validations/task";
import { createTask } from "@/lib/services/task-service";
import { listCustomers } from "@/lib/services/customer-service";
import { getOptionGroups } from "@/lib/services/option-service";
import { listAssignableUsers } from "@/lib/services/user-service";

async function createAction(formData: FormData) {
  "use server";
  await requireRole(["ADMIN", "OPERATIONS"]);
  let message: string | null = null;
  try {
    const data = createTaskSchema.parse({
      title: formData.get("title"),
      description: formData.get("description") || undefined,
      priority: formData.get("priority") || undefined,
      dueDate: formData.get("dueDate") || undefined,
      customerId: formData.get("customerId") || undefined,
      assigneeId: formData.get("assigneeId") || undefined,
      publishTargetIds: formData.getAll("publishTargetIds").map(String),
    });
    await createTask(data);
  } catch (error) {
    if (error instanceof ApiError) message = error.message;
    else if (error instanceof ZodError) message = error.issues[0]?.message ?? "Geçersiz veri";
    else throw error;
  }
  redirect(message ? `/tasks/new?error=${encodeURIComponent(message)}` : "/tasks");
}

export default async function NewTaskPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await auth();
  const user = session!.user;

  if (user.role !== "ADMIN" && user.role !== "OPERATIONS") {
    redirect("/tasks");
  }

  const { error } = await searchParams;
  const [customers, users, options] = await Promise.all([
    listCustomers({ includeArchived: false }),
    listAssignableUsers(),
    getOptionGroups(),
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 lg:pl-64 print:pl-0">
      <Nav userName={user.name} userRole={user.role} />
      <main className="animate-fade-up mx-auto w-full max-w-lg flex-1 px-4 py-8">
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">Yeni Görev</h1>
        {error && <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        <form action={createAction} className="mt-6 space-y-4 rounded-2xl border border-neutral-200 bg-white shadow-sm p-6">
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-neutral-700">
              Başlık *
            </label>
            <input
              id="title"
              name="title"
              required
              className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-neutral-700">
              Açıklama
            </label>
            <textarea
              id="description"
              name="description"
              rows={3}
              className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="priority" className="block text-sm font-medium text-neutral-700">
                Öncelik
              </label>
              <select
                id="priority"
                name="priority"
                defaultValue="MEDIUM"
                className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              >
                <option value="LOW">Düşük</option>
                <option value="MEDIUM">Orta</option>
                <option value="HIGH">Yüksek</option>
              </select>
            </div>
            <div>
              <label htmlFor="dueDate" className="block text-sm font-medium text-neutral-700">
                Son Tarih
              </label>
              <input
                id="dueDate"
                name="dueDate"
                type="date"
                className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
          </div>

          <PublishTargetsField platforms={options.platforms} isAdmin={user.role === "ADMIN"} />

          <div>
            <label htmlFor="customerId" className="block text-sm font-medium text-neutral-700">
              Müşteri
            </label>
            <select
              id="customerId"
              name="customerId"
              defaultValue=""
              className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="">— Seçilmedi —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="assigneeId" className="block text-sm font-medium text-neutral-700">
              Atanan Kişi
            </label>
            <select
              id="assigneeId"
              name="assigneeId"
              defaultValue=""
              className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="">— Seçilmedi —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-on-brand hover:bg-brand-700"
            >
              Kaydet
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
