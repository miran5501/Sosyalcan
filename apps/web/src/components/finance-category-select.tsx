"use client";

import { useState } from "react";

const ADD_NEW = "__new__";
const inputClass =
  "mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

type Choice = { value: string; label: string };

/**
 * Admin'in listesinden seçim + (yetkisi olan rol için) "+ Yeni …" ile formdan çıkmadan ekleme.
 * `valueFrom: "label"` forma seçeneğin ADINI gönderir (finans kategorisi: kayıt adı metin olarak saklar),
 * `"id"` kimliğini gönderir (ödeme yöntemi: kayda bağlanır).
 */
export function OptionQuickSelect({
  kind,
  name,
  label,
  choices: initial,
  valueFrom,
  canQuickAdd,
  emptyLabel,
  addLabel,
}: {
  kind: string;
  name: string;
  label: string;
  choices: Choice[];
  valueFrom: "label" | "id";
  canQuickAdd: boolean;
  emptyLabel: string;
  addLabel: string;
}) {
  const [choices, setChoices] = useState(initial);
  const [value, setValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, label: text }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Eklenemedi");
      const choice = { value: valueFrom === "label" ? data.label : data.id, label: data.label };
      setChoices((prev) => [...prev, choice]);
      setValue(choice.value);
      setDraft("");
      setAdding(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eklenemedi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-neutral-700">
        {label}
      </label>
      <select
        id={name}
        name={name}
        value={value}
        onChange={(e) => {
          if (e.target.value === ADD_NEW) {
            setAdding(true);
            return;
          }
          setValue(e.target.value);
        }}
        className={inputClass}
      >
        <option value="">{emptyLabel}</option>
        {choices.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
        {canQuickAdd && <option value={ADD_NEW}>{addLabel}</option>}
      </select>
      {adding && (
        <div className="animate-fade-up mt-2 flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void add();
              }
            }}
            autoFocus
            maxLength={40}
            placeholder="Yeni ad"
            aria-label={addLabel}
            className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
          <button
            type="button"
            onClick={() => void add()}
            disabled={busy}
            className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-on-brand hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? "Ekleniyor…" : "Ekle"}
          </button>
          <button type="button" onClick={() => setAdding(false)} className="text-sm text-neutral-500 hover:text-neutral-900">
            Vazgeç
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}

/** Finans kaydında kategori seçimi: forma kategori ADI gider (geçmiş kayıt yeniden adlandırmadan etkilenmez). */
export function FinanceCategorySelect({ categories, canQuickAdd }: { categories: string[]; canQuickAdd: boolean }) {
  return (
    <OptionQuickSelect
      kind="FINANCE_CATEGORY"
      name="category"
      label="Kategori"
      choices={categories.map((c) => ({ value: c, label: c }))}
      valueFrom="label"
      canQuickAdd={canQuickAdd}
      emptyLabel="— Kategorisiz —"
      addLabel="+ Yeni kategori…"
    />
  );
}
