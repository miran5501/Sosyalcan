import Link from "next/link";

/**
 * Sayfa geçişi: "← Önceki · Sayfa 2 / 7 · Sonraki →". Mevcut süzgeçler (arama, etiket vb.)
 * korunur; yalnızca `page` değişir. Tek sayfa varsa hiçbir şey göstermez.
 */
export function Pagination({
  page,
  pageCount,
  total,
  basePath,
  params,
}: {
  page: number;
  pageCount: number;
  total: number;
  basePath: string;
  params?: Record<string, string | undefined>;
}) {
  if (pageCount <= 1) return null;
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params ?? {})) if (v) q.set(k, v);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return `${basePath}${s ? `?${s}` : ""}`;
  };
  const linkClass = "rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50";
  return (
    <nav className="mt-4 flex items-center justify-between gap-3 text-sm" aria-label="Sayfalar">
      {page > 1 ? (
        <Link href={href(page - 1)} className={linkClass}>
          ← Önceki
        </Link>
      ) : (
        <span />
      )}
      <span className="text-neutral-500">
        Sayfa {page} / {pageCount} · {total} kayıt
      </span>
      {page < pageCount ? (
        <Link href={href(page + 1)} className={linkClass}>
          Sonraki →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
