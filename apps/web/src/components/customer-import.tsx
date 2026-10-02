"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, FileSpreadsheet } from "lucide-react";

type Row = { line: number; name: string; contact: string | null; notes: string | null; tags: string[]; status: "new" | "duplicate" | "invalid"; error?: string };
type Preview = { rows: Row[]; counts: { new: number; duplicate: number; invalid: number } };

const STATUS: Record<Row["status"], { label: string; className: string }> = {
  new: { label: "Eklenecek", className: "bg-green-50 text-green-700" },
  duplicate: { label: "Zaten var, atlanacak", className: "bg-amber-50 text-amber-700" },
  invalid: { label: "Hatalı, atlanacak", className: "bg-red-50 text-red-700" },
};

async function send(file: File, mode: "preview" | "commit") {
  const form = new FormData();
  form.set("file", file);
  form.set("mode", mode);
  const response = await fetch("/api/customers/import", { method: "POST", body: form });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Dosya işlenemedi");
  return data;
}

/** Dosya seç → önizleme (her satırın ne olacağı) → onayla. */
export function CustomerImport() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function choose(selected: File | null) {
    setFile(selected);
    setPreview(null);
    setResult(null);
    setError(null);
    if (!selected) return;
    setBusy(true);
    try {
      setPreview(await send(selected, "preview"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dosya işlenemedi");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await send(file, "commit"));
      setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaydedilemedi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-neutral-700">
          <li>
            İlk satır başlık: <span className="font-medium">Ad</span> (zorunlu), İletişim, Notlar, Etiketler.
          </li>
          <li>Etiketler virgülle ayrılır.</li>
          <li>.xlsx ya da .csv, en fazla 1000 satır.</li>
        </ol>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-on-brand hover:bg-brand-700">
            <FileSpreadsheet className="h-4 w-4" aria-hidden />
            Dosya seç
            <input
              type="file"
              accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              aria-label="Aktarılacak dosya"
              onChange={(e) => void choose(e.target.files?.[0] ?? null)}
            />
          </label>
          <a href="/api/customers/import/template" download className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700">
            <Download className="h-4 w-4" aria-hidden />
            Şablonu indir
          </a>
          {file && <span className="text-sm text-neutral-500">{file.name}</span>}
          {busy && <span className="text-sm text-neutral-500">İşleniyor…</span>}
        </div>
      </div>

      {error && <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {result && (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-5 text-sm text-green-700">
          <p className="font-medium">{result.created} müşteri eklendi.</p>
          {result.skipped > 0 && <p className="mt-0.5">{result.skipped} satır atlandı (zaten kayıtlı ya da hatalı).</p>}
          <Link href="/customers" className="mt-2 inline-block font-medium underline">
            Müşteri listesine git
          </Link>
        </div>
      )}

      {preview && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-neutral-700">
              <span className="font-medium text-green-700">{preview.counts.new} eklenecek</span>
              {" · "}
              <span className="text-amber-700">{preview.counts.duplicate} zaten var</span>
              {" · "}
              <span className="text-red-700">{preview.counts.invalid} hatalı</span>
            </p>
            <button
              type="button"
              onClick={() => void commit()}
              disabled={busy || preview.counts.new === 0}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-on-brand hover:bg-brand-700 disabled:opacity-60"
            >
              {preview.counts.new} müşteriyi ekle
            </button>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="py-2 pr-3">Satır</th>
                  <th className="py-2 pr-3">Ad</th>
                  <th className="py-2 pr-3">İletişim</th>
                  <th className="py-2 pr-3">Etiketler</th>
                  <th className="py-2">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {preview.rows.map((row) => (
                  <tr key={row.line}>
                    <td className="py-2 pr-3 text-neutral-500">{row.line}</td>
                    <td className="py-2 pr-3 font-medium text-neutral-900">{row.name || "—"}</td>
                    <td className="py-2 pr-3 text-neutral-600">{row.contact ?? "—"}</td>
                    <td className="py-2 pr-3 text-neutral-600">{row.tags.join(", ") || "—"}</td>
                    <td className="py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[row.status].className}`}>{STATUS[row.status].label}</span>
                      {row.error && <span className="ml-2 text-xs text-red-700">{row.error}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
