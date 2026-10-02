import Link from "next/link";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { Nav } from "@/components/nav";
import { listCustomersPage, listCustomerTags, archiveCustomer, restoreCustomer } from "@/lib/services/customer-service";
import { Pagination } from "@/components/pagination";
import { parsePage } from "@/lib/pagination";
import { requireRole } from "@/lib/api-auth";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; tag?: string; includeArchived?: string; page?: string }>;
}) {
  const session = await auth();
  const user = session!.user;
  const canManage = user.role === "ADMIN" || user.role === "OPERATIONS";

  const { search, tag, includeArchived, page } = await searchParams;
  const [customerPage, allTags] = await Promise.all([
    listCustomersPage({ search, tag, includeArchived: includeArchived === "1", page: parsePage(page) }),
    listCustomerTags(),
  ]);
  const customers = customerPage.items;

  // Etiket süzgeci bağlantıları arama ve arşiv seçimini korur.
  const filterHref = (t?: string) => {
    const query = new URLSearchParams();
    if (search) query.set("search", search);
    if (includeArchived === "1") query.set("includeArchived", "1");
    if (t) query.set("tag", t);
    const qs = query.toString();
    return qs ? `/customers?${qs}` : "/customers";
  };

  async function archiveAction(formData: FormData) {
    "use server";
    await requireRole(["ADMIN", "OPERATIONS"]);
    const id = formData.get("id") as string;
    await archiveCustomer(id);
    revalidatePath("/customers");
  }

  async function restoreAction(formData: FormData) {
    "use server";
    await requireRole(["ADMIN", "OPERATIONS"]);
    const id = formData.get("id") as string;
    await restoreCustomer(id);
    revalidatePath("/customers");
  }

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 lg:pl-64 print:pl-0">
      <Nav userName={user.name} userRole={user.role} />
      <main className="animate-fade-up mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900">Müşteriler</h1>
          {canManage && (
            <div className="flex gap-2">
              <Link
                href="/customers/import"
                className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Excel/CSV&apos;den aktar
              </Link>
              <Link
                href="/customers/new"
                className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-on-brand hover:bg-brand-700"
              >
                + Yeni Müşteri
              </Link>
            </div>
          )}
        </div>

        <form className="mt-4 flex gap-3" method="get">
          <input
            type="text"
            name="search"
            defaultValue={search}
            placeholder="İsim veya iletişim bilgisiyle ara..."
            className="w-full max-w-sm rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
          <label className="flex items-center gap-2 text-sm text-neutral-600">
            <input type="checkbox" name="includeArchived" value="1" defaultChecked={includeArchived === "1"} />
            Arşivlenenleri de göster
          </label>
          <button
            type="submit"
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          >
            Ara
          </button>
          {tag && <input type="hidden" name="tag" value={tag} />}
        </form>

        {allTags.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-neutral-500">Etiket:</span>
            <Link
              href={filterHref()}
              className={`rounded-full px-2.5 py-1 ${!tag ? "bg-brand-600 text-on-brand" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}
            >
              Tümü
            </Link>
            {allTags.map((t) => (
              <Link
                key={t.tag}
                href={filterHref(t.tag)}
                className={`rounded-full px-2.5 py-1 ${tag === t.tag ? "bg-brand-600 text-on-brand" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}
              >
                {t.tag} ({t.count})
              </Link>
            ))}
          </div>
        )}

        <div className="mt-6 overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Ad</th>
                <th className="px-4 py-3 font-medium">İletişim</th>
                <th className="px-4 py-3 font-medium">Durum</th>
                {canManage && <th className="px-4 py-3 font-medium">İşlemler</th>}
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-neutral-400">
                    Kayıtlı müşteri yok
                  </td>
                </tr>
              )}
              {customers.map((c) => (
                <tr key={c.id} className="border-b border-neutral-100 transition-colors last:border-0 hover:bg-neutral-50">
                  <td className="px-4 py-3">
                    <Link href={`/customers/${c.id}`} className="font-medium text-neutral-900 hover:underline">
                      {c.name}
                    </Link>
                    {c.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {c.tags.map((t) => (
                          <span key={t} className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{c.contact || "—"}</td>
                  <td className="px-4 py-3">
                    {c.archivedAt ? (
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
                        Arşivde
                      </span>
                    ) : (
                      <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">Aktif</span>
                    )}
                  </td>
                  {canManage && (
                    <td className="px-4 py-3">
                      {c.archivedAt ? (
                        <form action={restoreAction}>
                          <input type="hidden" name="id" value={c.id} />
                          <button type="submit" className="text-sm text-neutral-600 hover:text-neutral-900">
                            Geri Yükle
                          </button>
                        </form>
                      ) : (
                        <form action={archiveAction}>
                          <input type="hidden" name="id" value={c.id} />
                          <button type="submit" className="text-sm text-red-600 hover:text-red-800">
                            Arşivle
                          </button>
                        </form>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          page={customerPage.page}
          pageCount={customerPage.pageCount}
          total={customerPage.total}
          basePath="/customers"
          params={{ search, tag, includeArchived }}
        />
      </main>
    </div>
  );
}
