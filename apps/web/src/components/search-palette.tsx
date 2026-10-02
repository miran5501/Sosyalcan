"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

type Hit = { group: string; id: string; title: string; subtitle?: string; href: string };

const GROUP_LABELS: Record<string, string> = {
  customers: "Müşteriler",
  tasks: "Görevler",
  shoots: "Çekimler",
  appointments: "Randevular",
  transactions: "Finans kayıtları",
  paymentPlans: "Ödeme planları",
};

/**
 * Menüdeki arama kutusu. Ctrl+K (Mac'te ⌘K) ya da düğmeyle açılır; yazdıkça sunucuda arar,
 * ok tuşlarıyla seçilip Enter ile gidilir, Esc kapatır.
 */
export function SearchPalette({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  // Kısayol: Ctrl+K / ⌘K her sayfada aramayı açar. İki menü (geniş/dar ekran) olduğundan yalnızca görünür olan dinler.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        if (!rootRef.current || rootRef.current.getClientRects().length === 0) return; // gizli menüdeki kopya
        event.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) return; // kısa sorguda sonuçlar zaten gösterilmiyor
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const data = await response.json();
        setHits(response.ok ? data.results : []);
        setActive(0);
      } catch {
        // iptal edilen istek (yeni harf yazıldı) ya da ağ hatası: sonuçları olduğu gibi bırak
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  function close() {
    setOpen(false);
    setQuery("");
    setHits([]);
  }

  function go(hit: Hit | undefined) {
    if (!hit) return;
    close();
    router.push(hit.href);
  }

  function onInputKey(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, hits.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(hits[active]);
    } else if (event.key === "Escape") {
      close();
    }
  }

  const groups = [...new Set(hits.map((h) => h.group))];

  return (
    <div ref={rootRef}>
      {compact ? (
        <button type="button" onClick={() => setOpen(true)} aria-label="Ara" className="rounded-md p-2 text-neutral-600 hover:bg-neutral-100">
          <Search className="h-5 w-5" aria-hidden />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-100"
        >
          <Search className="h-4 w-4" aria-hidden />
          <span className="flex-1 text-left">Ara…</span>
          <kbd className="rounded border border-neutral-300 bg-white px-1.5 text-[10px] font-medium text-neutral-500">Ctrl K</kbd>
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh]" onClick={close} role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Arama"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl"
          >
            <div className="flex items-center gap-2 border-b border-neutral-200 px-4">
              <Search className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKey}
                placeholder="Müşteri, görev, çekim, randevu ara…"
                aria-label="Arama"
                className="w-full bg-transparent py-3.5 text-sm text-neutral-900 outline-none placeholder:text-neutral-400"
              />
              <button type="button" onClick={close} aria-label="Kapat" className="rounded p-1 text-neutral-400 hover:text-neutral-700">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-2">
              {query.trim().length < 2 ? (
                <p className="px-3 py-6 text-center text-sm text-neutral-500">En az 2 harf yaz.</p>
              ) : hits.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-neutral-500">{loading ? "Aranıyor…" : "Sonuç bulunamadı."}</p>
              ) : (
                groups.map((group) => (
                  <div key={group} className="mb-1">
                    <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">{GROUP_LABELS[group] ?? group}</p>
                    <ul>
                      {hits.map((hit, index) =>
                        hit.group === group ? (
                          <li key={`${hit.group}-${hit.id}`}>
                            <button
                              type="button"
                              onMouseEnter={() => setActive(index)}
                              onClick={() => go(hit)}
                              className={`w-full rounded-lg px-3 py-2 text-left ${index === active ? "bg-brand-50" : ""}`}
                            >
                              <span className="block truncate text-sm font-medium text-neutral-900">{hit.title}</span>
                              {hit.subtitle && <span className="block truncate text-xs text-neutral-500">{hit.subtitle}</span>}
                            </button>
                          </li>
                        ) : null,
                      )}
                    </ul>
                  </div>
                ))
              )}
            </div>
            <p className="border-t border-neutral-200 px-4 py-2 text-xs text-neutral-400">↑↓ seç · Enter git · Esc kapat</p>
          </div>
        </div>
      )}
    </div>
  );
}
