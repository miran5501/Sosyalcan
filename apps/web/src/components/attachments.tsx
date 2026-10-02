"use client";

import { useRef, useState } from "react";
import { FileText, Paperclip, Trash2, Upload } from "lucide-react";

export type AttachmentItem = { id: string; fileName: string; contentType: string; size: number; createdAt: string; uploadedBy: string | null };

const INLINE = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"]);

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Kayda bağlı dosyalar (çekim / finans kaydı): liste, aç/indir, yükle, sil.
 * Yetki sunucuda denetlenir; `canManage` yalnızca düğmeleri gösterir/gizler.
 */
export function Attachments({
  owner,
  initial,
  canManage,
  storageReason,
  maxMb,
  hint,
}: {
  owner: { shootId: string } | { transactionId: string };
  initial: AttachmentItem[];
  canManage: boolean;
  /** Depolama kapalıysa nedeni (yükleme düğmesi pasif olur). */
  storageReason: string | null;
  maxMb: number;
  hint?: string;
}) {
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        if (file.size > maxMb * 1024 * 1024) throw new Error(`${file.name}: dosya en fazla ${maxMb} MB olabilir`);
        const form = new FormData();
        form.set("file", file);
        for (const [key, value] of Object.entries(owner)) form.set(key, value);
        const response = await fetch("/api/attachments", { method: "POST", body: form });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(`${file.name}: ${data.error ?? "yüklenemedi"}`);
        setItems((list) => [{ ...data, uploadedBy: data.uploadedBy?.name ?? null }, ...list]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yüklenemedi");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(item: AttachmentItem) {
    if (!confirm(`"${item.fileName}" silinsin mi? Bu işlem geri alınamaz.`)) return;
    setError(null);
    const response = await fetch(`/api/attachments/${item.id}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? "Silinemedi");
      return;
    }
    setItems((list) => list.filter((i) => i.id !== item.id));
  }

  return (
    <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
          <Paperclip className="h-4 w-4 text-neutral-500" aria-hidden />
          Dosyalar {items.length > 0 && <span className="font-normal text-neutral-500">({items.length})</span>}
        </h2>
        {canManage && (
          <label
            className={`inline-flex items-center gap-2 rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-on-brand ${
              storageReason || busy ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-brand-700"
            }`}
          >
            <Upload className="h-4 w-4" aria-hidden />
            {busy ? "Yükleniyor…" : "Dosya ekle"}
            <input
              ref={inputRef}
              type="file"
              multiple
              disabled={Boolean(storageReason) || busy}
              className="sr-only"
              aria-label="Dosya ekle"
              onChange={(e) => void upload(e.target.files)}
            />
          </label>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-neutral-500">{hint}</p>}
      {canManage && storageReason && <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">{storageReason}</p>}

      {items.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-500">Henüz dosya yok.</p>
      ) : (
        <ul className="mt-4 divide-y divide-neutral-100">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-2.5">
              <FileText className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
              <div className="min-w-0 flex-1">
                <a
                  href={`/api/attachments/${item.id}${INLINE.has(item.contentType) ? "?inline=1" : ""}`}
                  target={INLINE.has(item.contentType) ? "_blank" : undefined}
                  rel="noopener"
                  className="block truncate text-sm font-medium text-brand-600 hover:text-brand-700"
                >
                  {item.fileName}
                </a>
                <p className="text-xs text-neutral-500">
                  {formatSize(item.size)} · {new Date(item.createdAt).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" })}
                  {item.uploadedBy ? ` · ${item.uploadedBy}` : ""}
                </p>
              </div>
              {canManage && (
                <button type="button" onClick={() => void remove(item)} aria-label={`${item.fileName} sil`} className="rounded p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-700">
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </section>
  );
}
