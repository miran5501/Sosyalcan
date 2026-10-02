import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ZodError } from "zod";
import { Field, OptionList, PageShell, SubmitButton, inputClass, withCurrent } from "@/components/form-fields";
import { OptionSelect, PublishTargetsField } from "@/components/shoot-option-fields";
import { ApiError, requireRole } from "@/lib/api-auth";
import { toDateInputValue } from "@/lib/datetime";
import { PRIORITY_LABELS, formatDateTime } from "@/lib/labels";
import { orNotFound } from "@/lib/not-found";
import { addTaskComment, listTaskComments } from "@/lib/services/task-comment-service";
import { listCustomers } from "@/lib/services/customer-service";
import { getOptionGroups } from "@/lib/services/option-service";
import { addTaskLink, listTaskLinks, removeTaskLink } from "@/lib/services/task-link-service";
import { getTaskById, updateTask } from "@/lib/services/task-service";
import { listAssignableUsers } from "@/lib/services/user-service";
import { createTaskCommentSchema, createTaskLinkSchema, updateTaskSchema } from "@/lib/validations/task";

export default async function EditTaskPage({
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

  const task = await orNotFound(getTaskById(id));
  const [customers, users, comments, links, options] = await Promise.all([
    listCustomers({ includeArchived: false }),
    listAssignableUsers(),
    listTaskComments(id),
    listTaskLinks(id),
    getOptionGroups(),
  ]);
  const editable = canManage && !task.archivedAt;
  const { error } = await searchParams;

  async function updateAction(formData: FormData) {
    "use server";
    await requireRole(["ADMIN", "OPERATIONS"]);
    let message: string | null = null;
    try {
      // Boş bırakılan alanlar "" olarak gönderilir: servis bunları temizler (null yapar).
      const data = updateTaskSchema.parse({
        title: formData.get("title"),
        description: formData.get("description") ?? "",
        priority: formData.get("priority"),
        statusId: formData.get("statusId"),
        dueDate: formData.get("dueDate") ?? "",
        customerId: formData.get("customerId") ?? "",
        assigneeId: formData.get("assigneeId") ?? "",
        publishTargetIds: formData.getAll("publishTargetIds").map(String),
      });
      await updateTask(id, data);
    } catch (error) {
      // Seçenek bu arada kaldırılmış olabilir: hata ekranı yerine formda mesaj.
      if (error instanceof ApiError) message = error.message;
      else if (error instanceof ZodError) message = error.issues[0]?.message ?? "Geçersiz veri";
      else throw error;
    }
    revalidatePath("/tasks");
    redirect(message ? `/tasks/${id}/edit?error=${encodeURIComponent(message)}` : "/tasks");
  }

  async function commentAction(formData: FormData) {
    "use server";
    const actor = await requireRole(["ADMIN", "OPERATIONS"]);
    const data = createTaskCommentSchema.parse({ body: formData.get("body") });
    await addTaskComment(id, actor.user.id, data);
    revalidatePath(`/tasks/${id}/edit`);
  }

  async function addLinkAction(formData: FormData) {
    "use server";
    const actor = await requireRole(["ADMIN", "OPERATIONS"]);
    const data = createTaskLinkSchema.parse({ url: formData.get("url"), label: formData.get("label") || undefined });
    await addTaskLink(id, actor.user.id, data);
    revalidatePath(`/tasks/${id}/edit`);
  }

  async function removeLinkAction(formData: FormData) {
    "use server";
    await requireRole(["ADMIN", "OPERATIONS"]);
    await removeTaskLink(id, String(formData.get("linkId")));
    revalidatePath(`/tasks/${id}/edit`);
  }

  return (
    <PageShell user={user} title={editable ? "Görevi Düzenle" : "Görev"}>
      {task.archivedAt && (
        <p className="mt-4 rounded-md bg-neutral-100 px-3 py-2 text-sm text-neutral-600">Bu görev arşivlenmiş; değiştirilemez.</p>
      )}
      {error && <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <form action={editable ? updateAction : undefined} className="mt-6 rounded-2xl border border-neutral-200 bg-white shadow-sm p-6">
        <fieldset disabled={!editable} className="space-y-4">
          <Field id="title" label="Başlık *">
            <input id="title" name="title" required defaultValue={task.title} className={inputClass} />
          </Field>
          <Field id="description" label="Açıklama">
            <textarea id="description" name="description" rows={3} defaultValue={task.description ?? ""} className={inputClass} />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <OptionSelect id="statusId" label="Durum" options={options.taskStatuses} current={task.status} />
            <Field id="priority" label="Öncelik">
              <select id="priority" name="priority" defaultValue={task.priority} className={inputClass}>
                {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field id="dueDate" label="Son Tarih">
            <input
              id="dueDate"
              name="dueDate"
              type="date"
              defaultValue={task.dueDate ? toDateInputValue(task.dueDate) : ""}
              className={inputClass}
            />
          </Field>
          <PublishTargetsField platforms={options.platforms} selected={task.publishTargets} isAdmin={user.role === "ADMIN"} />
          <Field id="customerId" label="Müşteri">
            <select id="customerId" name="customerId" defaultValue={task.customerId ?? ""} className={inputClass}>
              <OptionList items={withCurrent(customers, task.customer)} />
            </select>
          </Field>
          <Field id="assigneeId" label="Atanan Kişi">
            <select id="assigneeId" name="assigneeId" defaultValue={task.assigneeId ?? ""} className={inputClass}>
              <OptionList items={withCurrent(users, task.assignee)} />
            </select>
          </Field>
        </fieldset>

        <div className="mt-4 flex items-center gap-3">
          {editable && <SubmitButton>Kaydet</SubmitButton>}
          <Link href="/tasks" className="text-sm text-neutral-600 hover:text-neutral-900">
            ← Görevler
          </Link>
        </div>
      </form>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-900">
          Bağlantılar <span className="font-normal text-neutral-400">({links.length})</span>
        </h2>

        <div className="mt-3 space-y-2">
          {links.length === 0 && <p className="text-sm text-neutral-400">Henüz bağlantı yok</p>}
          {links.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-2">
              <div className="min-w-0">
                <a href={l.url} target="_blank" rel="noreferrer" className="block truncate text-sm text-blue-600 hover:underline">
                  {l.label || l.url}
                </a>
                <p className="text-xs text-neutral-400">{l.author.name}</p>
              </div>
              {editable && (
                <form action={removeLinkAction}>
                  <input type="hidden" name="linkId" value={l.id} />
                  <button type="submit" className="text-xs text-red-600 hover:text-red-800">
                    Kaldır
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>

        {editable && (
          <form action={addLinkAction} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input name="url" type="url" required placeholder="https://drive.google.com/..." className={inputClass} />
            <input name="label" maxLength={100} placeholder="Etiket (isteğe bağlı)" className={inputClass} />
            <button type="submit" className="mt-1 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-on-brand hover:bg-brand-700">
              Ekle
            </button>
          </form>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-900">
          Yorumlar <span className="font-normal text-neutral-400">({comments.length})</span>
        </h2>

        <div className="mt-3 space-y-3">
          {comments.length === 0 && <p className="text-sm text-neutral-400">Henüz yorum yok</p>}
          {comments.map((c) => (
            <div key={c.id} className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
              <p className="text-xs text-neutral-500">
                <span className="font-medium text-neutral-700">{c.author.name}</span> · {formatDateTime(c.createdAt)}
              </p>
              <p className="mt-1 whitespace-pre-line text-sm text-neutral-900">{c.body}</p>
            </div>
          ))}
        </div>

        {editable && (
          <form action={commentAction} className="mt-4 space-y-3">
            <label htmlFor="body" className="sr-only">
              Yorum
            </label>
            <textarea
              id="body"
              name="body"
              rows={3}
              required
              maxLength={2000}
              placeholder="Yorum veya not ekle..."
              className={inputClass}
            />
            <SubmitButton>Yorum Ekle</SubmitButton>
          </form>
        )}
      </section>
    </PageShell>
  );
}
