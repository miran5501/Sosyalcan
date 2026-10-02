"use client";

import { useMemo, useRef, useState } from "react";
import { foldCase } from "@/lib/tags";

type Item = { id: string; label: string };
type Category = Item & { items: Item[] };
type Selected = { id: string; label: string; parent: { label: string } | null };

const NEW_CATEGORY = "__new__";

async function createOption(body: { kind: string; label: string; parentId?: string }) {
  const res = await fetch("/api/options", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "Eklenemedi");
  return data as Item;
}

/**
 * Çekim formundaki ekipman seçimi: "+ Ekipman ekle" ile aranır, tıklanınca eklenir; seçilenler
 * `equipmentIds` adıyla forma gider. Aranan ekipman listede yoksa (yetkisi olan rol için) aynı yerden
 * kategori seçilerek (ya da yeni kategori açılarak) listeye eklenir ve çekime seçilir.
 */
export function EquipmentPicker({
  categories: initialCategories,
  selected: initialSelected,
  canQuickAdd,
  disabled,
}: {
  categories: Category[];
  selected: Selected[];
  canQuickAdd: boolean;
  disabled?: boolean;
}) {
  const [categories, setCategories] = useState(initialCategories);
  const [selected, setSelected] = useState(initialSelected);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState(initialCategories[0]?.id ?? NEW_CATEGORY);
  const [newCategory, setNewCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selectedIds = new Set(selected.map((s) => s.id));
  const q = foldCase(query.trim());

  const results = useMemo(
    () =>
      categories
        .map((c) => ({
          ...c,
          items: c.items.filter(
            (i) => !selectedIds.has(i.id) && (!q || foldCase(i.label).includes(q) || foldCase(c.label).includes(q)),
          ),
        }))
        .filter((c) => c.items.length > 0),
    // selectedIds her render'da yeni Set; seçim değişikliği `selected` ile izlenir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categories, selected, q],
  );
  const exactExists = categories.some((c) => c.items.some((i) => foldCase(i.label) === q));

  function add(item: Item, category: Item) {
    setSelected((prev) => (prev.some((s) => s.id === item.id) ? prev : [...prev, { ...item, parent: { label: category.label } }]));
    setQuery("");
    searchRef.current?.focus();
  }

  async function quickAdd() {
    const label = query.trim();
    if (!label) return;
    setBusy(true);
    setError(null);
    try {
      let category = categories.find((c) => c.id === categoryId);
      if (!category) {
        if (!newCategory.trim()) throw new Error("Yeni kategori adını yaz");
        const created = await createOption({ kind: "EQUIPMENT_CATEGORY", label: newCategory.trim() });
        category = { ...created, items: [] };
        setCategories((prev) => [...prev, category!]);
        setCategoryId(created.id);
        setNewCategory("");
      }
      const item = await createOption({ kind: "EQUIPMENT", label, parentId: category.id });
      const target = category;
      setCategories((prev) => prev.map((c) => (c.id === target.id ? { ...c, items: [...c.items, item] } : c)));
      add(item, target);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eklenemedi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset disabled={disabled}>
      <legend className="block text-sm font-medium text-neutral-700">Ekipman</legend>
      {selected.map((s) => (
        <input key={s.id} type="hidden" name="equipmentIds" value={s.id} />
      ))}

      <div className="mt-1 rounded-md border border-neutral-300 bg-white p-3">
        {selected.length === 0 && <p className="text-sm text-neutral-400">Henüz ekipman seçilmedi</p>}
        {selected.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {selected.map((s) => (
              <li key={s.id} className="flex items-center gap-1 rounded-full bg-neutral-100 py-0.5 pl-2.5 pr-1 text-sm text-neutral-800">
                {s.parent && <span className="text-xs text-neutral-500">{s.parent.label} ·</span>}
                {s.label}
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => setSelected((prev) => prev.filter((x) => x.id !== s.id))}
                    className="ml-0.5 flex h-5 w-5 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900"
                    aria-label={`${s.label} ekipmanını çıkar`}
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {!disabled && !open && (
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              setTimeout(() => searchRef.current?.focus(), 0);
            }}
            className="mt-2 rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
          >
            + Ekipman ekle
          </button>
        )}

        {!disabled && open && (
          <div className="mt-3 border-t border-neutral-100 pt-3">
            <div className="flex gap-2">
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  // Enter formu göndermesin: tek sonuç varsa onu ekler.
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const only = results.length === 1 && results[0].items.length === 1 ? results[0] : null;
                    if (only) add(only.items[0], only);
                  }
                  if (e.key === "Escape") setOpen(false);
                }}
                placeholder="Ekipman ara (ör. kamera, mikrofon)"
                aria-label="Ekipman ara"
                className="min-w-0 flex-1 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm text-neutral-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
              <button type="button" onClick={() => setOpen(false)} className="text-sm text-neutral-500 hover:text-neutral-900">
                Kapat
              </button>
            </div>

            <div className="mt-2 max-h-56 space-y-2 overflow-y-auto">
              {results.map((c) => (
                <div key={c.id}>
                  <p className="text-xs font-medium text-neutral-500">{c.label}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {c.items.map((i) => (
                      <button
                        key={i.id}
                        type="button"
                        onClick={() => add(i, c)}
                        className="rounded-full border border-neutral-200 px-2.5 py-0.5 text-sm text-neutral-800 hover:border-neutral-400 hover:bg-neutral-50"
                      >
                        + {i.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {results.length === 0 && (
                <p className="text-sm text-neutral-400">
                  {categories.length === 0 ? "Ekipman listesi henüz boş." : q ? "Aramaya uyan ekipman yok." : "Listedeki tüm ekipmanlar seçildi."}
                </p>
              )}
            </div>

            {canQuickAdd && q && !exactExists && (
              <div className="mt-3 rounded-md bg-neutral-50 p-3">
                <p className="text-sm text-neutral-700">
                  Listede yok mu? <span className="font-medium">&quot;{query.trim()}&quot;</span> ekipmanını listeye ekle:
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    aria-label="Kategori"
                    className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                    <option value={NEW_CATEGORY}>+ Yeni kategori…</option>
                  </select>
                  {categoryId === NEW_CATEGORY && (
                    <input
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      placeholder="Kategori adı"
                      aria-label="Yeni kategori adı"
                      maxLength={40}
                      className="rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm text-neutral-900"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => void quickAdd()}
                    disabled={busy}
                    className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-on-brand hover:bg-brand-700 disabled:opacity-50"
                  >
                    {busy ? "Ekleniyor…" : "Ekle ve seç"}
                  </button>
                </div>
              </div>
            )}
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          </div>
        )}
      </div>
    </fieldset>
  );
}
