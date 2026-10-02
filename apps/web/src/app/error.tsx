"use client"; // Hata sınırları (error boundary) istemci bileşeni olmak zorunda

import Link from "next/link";
import { useEffect } from "react";

/** Beklenmeyen sunucu/arayüz hatasında İngilizce varsayılan ekran yerine gösterilen Türkçe sayfa. */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
    // Hata takibine bildir (Ayarlar → Sistem Durumu). Başarısız olursa sessizce geç.
    void fetch("/api/client-errors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        source: "web",
        message: error.message || "Bilinmeyen hata",
        digest: error.digest,
        path: window.location.pathname,
        stack: error.stack?.slice(0, 4000),
      }),
    }).catch(() => undefined);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-4 text-center">
      <h1 className="text-xl font-semibold tracking-tight text-neutral-900">Bir şeyler ters gitti</h1>
      <p className="mt-1 max-w-sm text-sm text-neutral-500">
        Sayfa yüklenirken beklenmeyen bir hata oluştu. Tekrar deneyebilir ya da ana sayfaya dönebilirsin.
      </p>
      {error.digest && <p className="mt-2 font-mono text-xs text-neutral-400">Hata kodu: {error.digest}</p>}
      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={() => retry()}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-on-brand hover:bg-brand-700"
        >
          Tekrar dene
        </button>
        <Link
          href="/"
          className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
        >
          Ana sayfa
        </Link>
      </div>
    </main>
  );
}
