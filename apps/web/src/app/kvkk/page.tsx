import Link from "next/link";
import { connection } from "next/server";
import { RichText } from "@/components/rich-text";
import { getPrivacySettings } from "@/lib/services/privacy-service";

/** KVKK aydınlatma metni (oturum gerektirmez; giriş sayfasından bağlantı verilir). */
export default async function PrivacyNoticePage() {
  // Her istekte veritabanından okunur: derlemede sabitlenmesin (Admin metni değiştirince hemen görünsün,
  // derleme sırasında veritabanı gerekmesin).
  await connection();
  const { notice, isTemplate } = await getPrivacySettings();
  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-10">
      <article className="mx-auto max-w-3xl rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-10">
        {isTemplate && (
          <p className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Bu metin henüz taslaktır: köşeli parantez içindeki bilgiler ajans tarafından doldurulmalıdır.
          </p>
        )}
        <RichText text={notice} />
        <Link href="/login" className="mt-8 inline-block text-sm text-neutral-600 hover:text-neutral-900">
          ← Giriş sayfası
        </Link>
      </article>
    </div>
  );
}
