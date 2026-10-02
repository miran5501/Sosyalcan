import { CheckCircle2, Circle, X } from "lucide-react";
import { formatDateTime } from "@/lib/labels";

type ChecklistItem = { id: string; label: string; done: boolean; doneAt: Date | null; doneBy: { name: string } | null };

/** Listede ve kartlarda: "✓ 2/4 · 1 revizyon". Liste boşsa ve revizyon yoksa hiçbir şey göstermez. */
export function ShootProgress({ checklist, revisionCount }: { checklist: { done: boolean }[]; revisionCount: number }) {
  const done = checklist.filter((i) => i.done).length;
  if (checklist.length === 0 && revisionCount === 0) return null;
  const complete = checklist.length > 0 && done === checklist.length;
  return (
    <span className="mt-1 flex flex-wrap gap-x-2 text-xs text-neutral-500">
      {checklist.length > 0 && (
        <span className={complete ? "text-green-700" : undefined} title="Teslim kontrol listesi">
          ✓ {done}/{checklist.length}
        </span>
      )}
      {revisionCount > 0 && <span title="Revizyon sayısı">{revisionCount} revizyon</span>}
    </span>
  );
}

/**
 * Çekim sayfasındaki teslim kontrol listesi. Her madde ayrı bir küçük form (server action) ile
 * işaretlenir; yetkisi olmayan kişi listeyi salt okunur görür.
 */
export function ShootChecklist({
  items,
  editable,
  toggleAction,
  addAction,
  removeAction,
}: {
  items: ChecklistItem[];
  editable: boolean;
  toggleAction: (formData: FormData) => Promise<void>;
  addAction: (formData: FormData) => Promise<void>;
  removeAction: (formData: FormData) => Promise<void>;
}) {
  const done = items.filter((i) => i.done).length;
  const percent = items.length ? Math.round((done / items.length) * 100) : 0;

  return (
    <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold text-neutral-900">Teslim Kontrol Listesi</h2>
        <span className="text-sm text-neutral-500">
          {done}/{items.length} tamamlandı
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100" aria-hidden>
        <div className={`h-full rounded-full ${percent === 100 ? "bg-green-500" : "bg-brand-500"}`} style={{ width: `${percent}%` }} />
      </div>

      {items.length === 0 && <p className="mt-4 text-sm text-neutral-500">Bu çekimin kontrol listesi boş.</p>}
      <ul className="mt-3 divide-y divide-neutral-100">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 py-2">
            <form action={editable ? toggleAction : undefined} className="flex min-w-0 flex-1 items-center gap-3">
              <input type="hidden" name="itemId" value={item.id} />
              <input type="hidden" name="done" value={item.done ? "false" : "true"} />
              <button
                type="submit"
                disabled={!editable}
                aria-label={item.done ? `${item.label}: işareti kaldır` : `${item.label}: tamamlandı olarak işaretle`}
                className="shrink-0 disabled:cursor-default"
              >
                {item.done ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" aria-hidden />
                ) : (
                  <Circle className="h-5 w-5 text-neutral-400" aria-hidden />
                )}
              </button>
              <span className="min-w-0">
                <span className={`block text-sm ${item.done ? "text-neutral-500 line-through" : "text-neutral-900"}`}>{item.label}</span>
                {item.done && item.doneAt && (
                  <span className="block text-xs text-neutral-400">
                    {item.doneBy?.name ?? "—"} · {formatDateTime(item.doneAt)}
                  </span>
                )}
              </span>
            </form>
            {editable && (
              <form action={removeAction}>
                <input type="hidden" name="itemId" value={item.id} />
                <button type="submit" aria-label={`${item.label} maddesini kaldır`} className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-red-600">
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>

      {editable && (
        <form action={addAction} className="mt-3 flex gap-2">
          <input
            name="label"
            required
            maxLength={120}
            placeholder="Bu çekime özel madde ekle (ör. Logo animasyonu eklendi)"
            aria-label="Yeni kontrol maddesi"
            className="w-full min-w-0 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
          <button type="submit" className="shrink-0 rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50">
            Ekle
          </button>
        </form>
      )}
      <p className="mt-3 text-xs text-neutral-500">Varsayılan maddeler Ayarlar → Seçenek Listeleri → Çekimler&apos;den yönetilir.</p>
    </section>
  );
}
