import Link from "next/link";
import { auth } from "@/auth";
import { Nav } from "@/components/nav";
import { DONE_TASKS_LIMIT, countDoneTasks, listTasks } from "@/lib/services/task-service";
import { listOptions } from "@/lib/services/option-service";
import { KanbanBoard, type TaskCard } from "@/components/kanban-board";

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ allDone?: string }> }) {
  const session = await auth();
  const user = session!.user;
  const canManage = user.role === "ADMIN" || user.role === "OPERATIONS";

  const allDone = (await searchParams).allDone === "1";
  const [tasks, statuses, doneTotal] = await Promise.all([listTasks({ allDone }), listOptions({ kind: "TASK_STATUS" }), countDoneTasks()]);
  const cards: TaskCard[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    priority: t.priority,
    statusId: t.statusId,
    publishTargets: t.publishTargets,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    customer: t.customer,
    assignee: t.assignee,
  }));
  // Kaldırılmış bir duruma bağlı görev kaybolmasın: o durum sütun olarak sona eklenir.
  const columns = statuses.map((s) => ({ id: s.id, label: s.label, color: s.color }));
  for (const t of tasks) {
    if (!columns.some((c) => c.id === t.statusId)) columns.push({ id: t.status.id, label: `${t.status.label} (kaldırıldı)`, color: t.status.color });
  }

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 lg:pl-64 print:pl-0">
      <Nav userName={user.name} userRole={user.role} />
      <main className="animate-fade-up mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900">Görevler</h1>
          <div className="flex flex-wrap gap-2">
            {user.role === "ADMIN" && (
              <Link
                href="/settings/options?tab=tasks"
                className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
              >
                Sütunları Yönet
              </Link>
            )}
            {canManage && (
              <Link
                href="/tasks/new"
                className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-on-brand hover:bg-brand-700"
              >
                + Yeni Görev
              </Link>
            )}
          </div>
        </div>
        {canManage && (
          <p className="mt-1 text-xs text-neutral-400">Kartları sürükleyip bırakarak durumu değiştirebilirsin.</p>
        )}

        {doneTotal > DONE_TASKS_LIMIT && (
          <p className="mt-1 text-xs text-neutral-500">
            {allDone ? (
              <>
                Tamamlanan {doneTotal} görevin hepsi gösteriliyor.{" "}
                <Link href="/tasks" className="text-brand-700 hover:underline">
                  Yalnızca son {DONE_TASKS_LIMIT}&apos;u göster
                </Link>
              </>
            ) : (
              <>
                Tamamlanan sütunda son {DONE_TASKS_LIMIT} görev gösteriliyor (toplam {doneTotal}).{" "}
                <Link href="/tasks?allDone=1" className="text-brand-700 hover:underline">
                  Tümünü göster
                </Link>
              </>
            )}
          </p>
        )}

        <div className="mt-6">
          <KanbanBoard initialTasks={cards} columns={columns} canManage={canManage} />
        </div>
      </main>
    </div>
  );
}
