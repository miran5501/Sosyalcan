import Link from "next/link";

/** Bulunamayan kayıt veya adres için Türkçe 404 sayfası (orNotFound → notFound() buraya düşer). */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-4 text-center">
      <p className="text-5xl font-semibold text-neutral-300">404</p>
      <h1 className="mt-4 text-lg font-semibold text-neutral-900">Sayfa bulunamadı</h1>
      <p className="mt-1 max-w-sm text-sm text-neutral-500">
        Aradığın kayıt silinmiş, arşivlenmiş ya da adres hatalı olabilir.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-on-brand hover:bg-brand-700"
      >
        Ana sayfaya dön
      </Link>
    </main>
  );
}
