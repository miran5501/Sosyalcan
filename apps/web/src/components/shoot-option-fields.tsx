import Link from "next/link";
import { Field, inputClass } from "@/components/form-fields";
import { targetLabel } from "@/lib/options";

type Option = { id: string; label: string };
type Target = { id: string; label: string; parent?: { label: string } | null };
type Platform = Option & { formats: Option[] };

/** Seçim listesi; mevcut değer kaldırılmışsa listede "(kaldırıldı)" notuyla korunur. */
export function OptionSelect({
  id,
  label,
  options,
  current,
}: {
  id: string;
  label: string;
  options: Option[];
  current?: Option | null;
}) {
  const items = current && !options.some((o) => o.id === current.id) ? [{ ...current, label: `${current.label} (kaldırıldı)` }, ...options] : options;
  return (
    <Field id={id} label={label}>
      <select id={id} name={id} defaultValue={current?.id ?? items[0]?.id} className={inputClass}>
        {items.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

/**
 * "Nerede paylaşılacak": her platform ve altındaki paylaşım türleri onay kutusu olarak.
 * Platformun kendisi de seçilebilir (türü henüz belli değilse). Çekimde seçili olup sonradan
 * kaldırılmış hedefler ayrı satırda işaretli kalır ki kayıtta kaybolmasın.
 */
export function PublishTargetsField({
  platforms,
  selected = [],
  isAdmin,
}: {
  platforms: Platform[];
  selected?: Target[];
  isAdmin: boolean;
}) {
  const selectedIds = selected.map((t) => t.id);
  const offered = new Set(platforms.flatMap((p) => [p.id, ...p.formats.map((f) => f.id)]));
  const removed = selected.filter((t) => !offered.has(t.id));

  return (
    <fieldset>
      <legend className="block text-sm font-medium text-neutral-700">Nerede paylaşılacak</legend>
      <div className="mt-1 space-y-3 rounded-md border border-neutral-300 bg-white p-3">
        {platforms.length === 0 && (
          <p className="text-sm text-neutral-400">
            Henüz platform eklenmemiş.{" "}
            {isAdmin ? (
              <Link href="/settings/options?tab=publish" className="text-neutral-700 underline">
                Seçenekleri yönet
              </Link>
            ) : (
              "Admin, Ayarlar → Seçenek Listeleri'nden ekleyebilir."
            )}
          </p>
        )}
        {platforms.map((p) => (
          <div key={p.id}>
            <label className="flex items-center gap-2 text-sm font-medium text-neutral-900">
              <input type="checkbox" name="publishTargetIds" value={p.id} defaultChecked={selectedIds.includes(p.id)} />
              {p.label}
            </label>
            {p.formats.length > 0 && (
              <div className="ml-6 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {p.formats.map((f) => (
                  <label key={f.id} className="flex items-center gap-2 text-sm text-neutral-700">
                    <input type="checkbox" name="publishTargetIds" value={f.id} defaultChecked={selectedIds.includes(f.id)} />
                    {f.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
        {removed.map((t) => (
          <label key={t.id} className="flex items-center gap-2 text-sm text-neutral-500">
            <input type="checkbox" name="publishTargetIds" value={t.id} defaultChecked />
            {targetLabel(t)} (kaldırıldı)
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export { TargetBadges } from "@/components/target-badges";
