"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { updateTaskStatusAction, archiveTaskAction } from "@/app/tasks/actions";
import { TargetBadges } from "@/components/target-badges";
import { dotClass } from "@/lib/options";

/** Kanban sütunu = admin'in tanımladığı görev durumu (Ayarlar → Seçenek Listeleri → Görevler). */
export type KanbanColumn = { id: string; label: string; color: string | null };

export type TaskCard = {
  id: string;
  title: string;
  description: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH";
  statusId: string;
  dueDate: string | null;
  customer: { id: string; name: string } | null;
  assignee: { id: string; name: string } | null;
  publishTargets: { id: string; label: string; parent: { label: string } | null }[];
};

const PRIORITY_LABELS: Record<string, string> = { LOW: "Düşük", MEDIUM: "Orta", HIGH: "Yüksek" };
const PRIORITY_COLORS: Record<string, string> = {
  LOW: "bg-neutral-100 text-neutral-600",
  MEDIUM: "bg-amber-50 text-amber-700",
  HIGH: "bg-red-50 text-red-700",
};

export function KanbanBoard({
  initialTasks,
  columns,
  canManage,
}: {
  initialTasks: TaskCard[];
  columns: KanbanColumn[];
  canManage: boolean;
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [dragId, setDragId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleDrop(statusId: string) {
    if (!dragId || !canManage) return;
    const id = dragId;
    setDragId(null);
    setTasks((prev) => prev.map((t) => (t.id === id && t.statusId !== statusId ? { ...t, statusId } : t)));
    startTransition(async () => {
      await updateTaskStatusAction(id, statusId);
    });
  }

  function handleArchive(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    startTransition(async () => {
      await archiveTaskAction(id);
    });
  }

  return (
    // Sütun sayısı admin'e bağlı: dört sütuna kadar ekrana sığar, fazlası yatay kaydırılır.
    <div className="flex snap-x gap-4 overflow-x-auto pb-2">
      {columns.map((col) => {
        const colTasks = tasks.filter((t) => t.statusId === col.id);
        return (
          <div
            key={col.id}
            onDragOver={(e) => {
              if (canManage) e.preventDefault();
            }}
            onDrop={() => handleDrop(col.id)}
            className="min-h-[200px] w-72 shrink-0 snap-start rounded-2xl border border-neutral-200 bg-neutral-100/60 p-3 md:w-auto md:min-w-64 md:flex-1"
          >
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-700">
              <span className={`h-2 w-2 rounded-full ${dotClass(col.color)}`} aria-hidden />
              {col.label} <span className="text-neutral-400">({colTasks.length})</span>
            </h2>
            <div className="stagger space-y-2">
              {colTasks.map((t) => (
                <div
                  key={t.id}
                  draggable={canManage}
                  onDragStart={() => setDragId(t.id)}
                  className={`rounded-xl border border-neutral-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                    canManage ? "cursor-grab active:cursor-grabbing" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/tasks/${t.id}/edit`}
                      draggable={false}
                      className="text-sm font-medium text-neutral-900 hover:underline"
                    >
                      {t.title}
                    </Link>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        PRIORITY_COLORS[t.priority]
                      }`}
                    >
                      {PRIORITY_LABELS[t.priority]}
                    </span>
                  </div>
                  {t.customer && <p className="mt-1 text-xs text-neutral-500">{t.customer.name}</p>}
                  {t.assignee && <p className="mt-0.5 text-xs text-neutral-400">Atanan: {t.assignee.name}</p>}
                  {t.publishTargets.length > 0 && (
                    <div className="mt-2">
                      <TargetBadges targets={t.publishTargets} />
                    </div>
                  )}
                  {canManage && (
                    <button
                      onClick={() => handleArchive(t.id)}
                      className="mt-2 text-xs text-red-500 hover:text-red-700"
                    >
                      Arşivle
                    </button>
                  )}
                </div>
              ))}
              {colTasks.length === 0 && <p className="text-xs text-neutral-400">Görev yok</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
