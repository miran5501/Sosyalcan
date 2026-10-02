import Link from "next/link";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { Nav } from "@/components/nav";
import { listShootsPage, archiveShoot } from "@/lib/services/shoot-service";
import { Pagination } from "@/components/pagination";
import { parsePage } from "@/lib/pagination";
import { requireRole } from "@/lib/api-auth";
import { TargetBadges } from "@/components/shoot-option-fields";
import { ShootProgress } from "@/components/shoot-checklist";
import { badgeClass } from "@/lib/options";

export default async function ShootsPage({ searchParams }: { searchParams: Promise<{ when?: string; page?: string }> }) {
  const session = await auth();
  const user = session!.user;
  const canManage = user.role === "ADMIN" || user.role === "OPERATIONS";
  const params = await searchParams;
  const when = params.when === "past" ? "past" : "upcoming";
  const shootPage = await listShootsPage({ when, page: parsePage(params.page) });
  const shoots = shootPage.items;

  async function archiveAction(formData: FormData) {
    "use server";
    await requireRole(["ADMIN", "OPERATIONS"]);
    const id = formData.get("id") as string;
    await archiveShoot(id);
    revalidatePath("/shoots");
  }

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 lg:pl-64 print:pl-0">
      <Nav userName={user.name} userRole={user.role} />
      <main className="animate-fade-up mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900">Çekimler</h1>
          <div className="flex flex-wrap gap-2">
            {user.role === "ADMIN" && (
              <Link
                href="/settings/options?tab=shoots"
                className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
              >
                Seçenekleri Yönet
              </Link>
            )}
            {canManage && (
              <Link
                href="/shoots/new"
                className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-on-brand hover:bg-brand-700"
              >
                + Yeni Çekim
              </Link>
            )}
          </div>
        </div>

        <nav className="mt-5 flex gap-1 rounded-lg bg-neutral-100 p-1 text-sm sm:w-fit" aria-label="Çekim listesi">
          {(
            [
              ["upcoming", "Yaklaşan"],
              ["past", "Geçmiş"],
            ] as const
          ).map(([key, label]) => (
            <Link
              key={key}
              href={key === "upcoming" ? "/shoots" : "/shoots?when=past"}
              aria-current={when === key ? "page" : undefined}
              className={`flex-1 rounded-md px-4 py-1.5 text-center ${when === key ? "bg-white font-medium text-neutral-900 shadow-sm" : "text-neutral-600"}`}
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Tarih</th>
                <th className="px-4 py-3 font-medium">Tür</th>
                <th className="px-4 py-3 font-medium">Müşteri</th>
                <th className="px-4 py-3 font-medium">Konum</th>
                <th className="px-4 py-3 font-medium">Atanan</th>
                <th className="px-4 py-3 font-medium">Paylaşım</th>
                <th className="px-4 py-3 font-medium">Teslim Durumu</th>
                {canManage && <th className="px-4 py-3 font-medium">İşlemler</th>}
              </tr>
            </thead>
            <tbody>
              {shoots.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-neutral-400">
                    {when === "upcoming" ? "Yaklaşan çekim yok" : "Geçmiş çekim yok"}
                  </td>
                </tr>
              )}
              {shoots.map((s) => (
                <tr key={s.id} className="border-b border-neutral-100 transition-colors last:border-0 hover:bg-neutral-50">
                  <td className="px-4 py-3 text-neutral-900">
                    <Link href={`/shoots/${s.id}/edit`} className="hover:underline">
                      {new Date(s.scheduledAt).toLocaleString("tr-TR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{s.type.label}</td>
                  <td className="px-4 py-3 text-neutral-600">{s.customer?.name || "—"}</td>
                  <td className="px-4 py-3 text-neutral-600">{s.location || "—"}</td>
                  <td className="px-4 py-3 text-neutral-600">{s.assignee?.name || "—"}</td>
                  <td className="px-4 py-3 text-neutral-600">
                    {s.publishTargets.length > 0 ? <TargetBadges targets={s.publishTargets} /> : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${badgeClass(s.deliveryStatus.color)}`}>
                      {s.deliveryStatus.label}
                    </span>
                    {s.deliveryLink && (
                      <a href={s.deliveryLink} target="_blank" rel="noreferrer" className="ml-2 text-xs text-blue-600 hover:underline">
                        Link
                      </a>
                    )}
                    <ShootProgress checklist={s.checklist} revisionCount={s.revisionCount} />
                  </td>
                  {canManage && (
                    <td className="flex gap-3 px-4 py-3">
                      <Link href={`/shoots/${s.id}/edit`} className="text-sm text-neutral-700 hover:text-neutral-900">
                        Düzenle
                      </Link>
                      <form action={archiveAction}>
                        <input type="hidden" name="id" value={s.id} />
                        <button type="submit" className="text-sm text-red-600 hover:text-red-800">
                          Arşivle
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          page={shootPage.page}
          pageCount={shootPage.pageCount}
          total={shootPage.total}
          basePath="/shoots"
          params={{ when: when === "past" ? "past" : undefined }}
        />
      </main>
    </div>
  );
}
