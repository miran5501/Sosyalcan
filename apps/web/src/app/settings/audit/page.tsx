import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PageShell } from "@/components/form-fields";
import { AUDIT_ACTIONS, listAuditLogs } from "@/lib/audit";
import { FIELD_LABELS, MONEY_FIELDS, type ChangeMap } from "@/lib/audit-changes";
import { formatDateTime } from "@/lib/labels";
import { formatKurusAsTL } from "@/lib/money";
import { listAllUsers } from "@/lib/services/user-admin-service";

const ACTION_STYLES: Record<string, string> = {
  LOGIN_SUCCESS: "bg-green-50 text-green-700",
  LOGIN_FAILED: "bg-amber-50 text-amber-700",
  LOGIN_LOCKED: "bg-red-50 text-red-700",
  TOKEN_REUSE: "bg-red-50 text-red-700",
  LOGOUT: "bg-neutral-100 text-neutral-600",
  CREATE: "bg-brand-50 text-brand-700",
  UPDATE: "bg-blue-50 text-blue-700",
  DELETE: "bg-red-50 text-red-700",
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** Kayıttaki ham değeri okunur metne çevirir (TL, tarih, evet/hayır, liste). */
function showValue(field: string, value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (MONEY_FIELDS.has(field) && typeof value === "number") return formatKurusAsTL(value);
  if (typeof value === "string" && ISO_DATE.test(value)) return formatDateTime(new Date(value));
  if (typeof value === "boolean") return value ? "Evet" : "Hayır";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  return String(value);
}

function Changes({ changes }: { changes: ChangeMap }) {
  const entries = Object.entries(changes);
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs text-brand-700 hover:underline">
        {entries.length} alan · eski / yeni değerler
      </summary>
      <dl className="mt-2 space-y-1 rounded-lg bg-neutral-50 p-2 text-xs">
        {entries.map(([field, change]) => (
          <div key={field} className="grid grid-cols-[7rem_1fr] gap-2">
            <dt className="text-neutral-500">{FIELD_LABELS[field] ?? field}</dt>
            <dd className="break-words text-neutral-800">
              {"from" in change && <span className="text-red-700 line-through decoration-red-300">{showValue(field, change.from)}</span>}
              {"from" in change && "to" in change && <span className="mx-1 text-neutral-400">→</span>}
              {"to" in change && <span className="text-green-700">{showValue(field, change.to)}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

const selectClass =
  "rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

/** Denetim kaydı (yalnızca Admin): güvenlik olayları ve tüm veri değişiklikleri, en yeni üstte. */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; user?: string; page?: string }>;
}) {
  const session = await auth();
  const user = session!.user;
  if (user.role !== "ADMIN") {
    redirect("/");
  }

  const params = await searchParams;
  const action = params.action && params.action in AUDIT_ACTIONS ? params.action : undefined;
  const page = Math.max(1, Number(params.page) || 1);
  const [{ items, total, pageCount }, users] = await Promise.all([
    listAuditLogs({ page, action, userId: params.user || undefined }),
    listAllUsers(),
  ]);

  const pageHref = (p: number) => {
    const q = new URLSearchParams();
    if (action) q.set("action", action);
    if (params.user) q.set("user", params.user);
    if (p > 1) q.set("page", String(p));
    const query = q.toString();
    return `/settings/audit${query ? `?${query}` : ""}`;
  };

  return (
    <PageShell user={user} title="Denetim Kaydı" width="max-w-6xl">
      <p className="mt-1 text-sm text-neutral-500">
        Kim, ne zaman, neyi değiştirdi.
      </p>
      <Link href="/settings" className="mt-2 inline-block text-sm text-neutral-600 hover:text-neutral-900">
        ← Ayarlar
      </Link>

      <form className="mt-5 flex flex-wrap items-end gap-3" method="get">
        <div>
          <label htmlFor="action" className="block text-xs font-medium text-neutral-600">
            İşlem
          </label>
          <select id="action" name="action" defaultValue={action ?? ""} className={selectClass}>
            <option value="">Tümü</option>
            {Object.entries(AUDIT_ACTIONS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="user" className="block text-xs font-medium text-neutral-600">
            Kullanıcı
          </label>
          <select id="user" name="user" defaultValue={params.user ?? ""} className={selectClass}>
            <option value="">Herkes</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-on-brand hover:bg-brand-700">
          Filtrele
        </button>
        {(action || params.user) && (
          <Link href="/settings/audit" className="py-2 text-sm text-neutral-600 hover:text-neutral-900">
            Temizle
          </Link>
        )}
        <span className="ml-auto py-2 text-sm text-neutral-500">{total} kayıt</span>
      </form>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Zaman</th>
              <th className="px-4 py-3 font-medium">Kullanıcı</th>
              <th className="px-4 py-3 font-medium">İşlem</th>
              <th className="px-4 py-3 font-medium">Kayıt</th>
              <th className="px-4 py-3 font-medium">Ayrıntı</th>
              <th className="px-4 py-3 font-medium">IP</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">
                  Kayıt yok.
                </td>
              </tr>
            )}
            {items.map((log) => (
              <tr key={log.id} className="border-b border-neutral-100 align-top last:border-0 hover:bg-neutral-50">
                <td className="whitespace-nowrap px-4 py-3 text-neutral-600">{formatDateTime(log.createdAt)}</td>
                <td className="px-4 py-3 text-neutral-900">{log.user?.name ?? <span className="text-neutral-400">—</span>}</td>
                <td className="px-4 py-3">
                  <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${ACTION_STYLES[log.action] ?? "bg-neutral-100 text-neutral-600"}`}>
                    {AUDIT_ACTIONS[log.action as keyof typeof AUDIT_ACTIONS] ?? log.action}
                  </span>
                </td>
                <td className="px-4 py-3 text-neutral-700">{log.entity ?? "—"}</td>
                <td className="px-4 py-3 text-neutral-600">
                  {log.summary ?? ""}
                  {log.changes && typeof log.changes === "object" && <Changes changes={log.changes as ChangeMap} />}
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-neutral-500">{log.ip ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Sayfalar">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="text-neutral-700 hover:underline">
              ← Daha yeni
            </Link>
          ) : (
            <span />
          )}
          <span className="text-neutral-500">
            Sayfa {page} / {pageCount}
          </span>
          {page < pageCount ? (
            <Link href={pageHref(page + 1)} className="text-neutral-700 hover:underline">
              Daha eski →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </PageShell>
  );
}
