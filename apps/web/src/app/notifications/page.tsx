import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Bell, CheckCheck, X } from "lucide-react";
import { auth } from "@/auth";
import { PageShell } from "@/components/form-fields";
import { requireSession } from "@/lib/api-auth";
import { formatDateTime } from "@/lib/labels";
import { NOTIFICATION_TYPES, type NotificationType } from "@/lib/notification-types";
import { dismissNotification, listNotifications, markRead } from "@/lib/services/notification-service";

/** Bildirime tıklanınca: okundu işaretle, ilgili sayfaya git. */
async function openAction(formData: FormData) {
  "use server";
  const session = await requireSession();
  await markRead(session.user.id, { ids: [String(formData.get("id"))] });
  revalidatePath("/notifications");
  const link = String(formData.get("link") ?? "");
  // Yalnızca uygulama içi yollar (dışarıya yönlendirme yapılmaz).
  redirect(link.startsWith("/") && !link.startsWith("//") ? link : "/notifications");
}

/** Çarpı: bildirimi listeden kaldırır (yalnızca kendi bildirimi). */
async function dismissAction(formData: FormData) {
  "use server";
  const session = await requireSession();
  await dismissNotification(session.user.id, String(formData.get("id"))).catch(() => undefined);
  revalidatePath("/notifications");
}

async function markAllAction() {
  "use server";
  const session = await requireSession();
  await markRead(session.user.id, { all: true });
  revalidatePath("/notifications");
}

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ unread?: string }> }) {
  const session = await auth();
  const user = session!.user;
  const { unread } = await searchParams;
  const unreadOnly = unread === "1";
  const { items, unreadCount } = await listNotifications(user.id, { unreadOnly });

  return (
    <PageShell user={user} title="Bildirimler" width="max-w-3xl">
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex gap-1 rounded-lg bg-neutral-100 p-1 text-sm" aria-label="Süzgeç">
          <Link
            href="/notifications"
            className={`rounded-md px-3 py-1 ${!unreadOnly ? "bg-white font-medium text-neutral-900 shadow-sm" : "text-neutral-600"}`}
          >
            Tümü
          </Link>
          <Link
            href="/notifications?unread=1"
            className={`rounded-md px-3 py-1 ${unreadOnly ? "bg-white font-medium text-neutral-900 shadow-sm" : "text-neutral-600"}`}
          >
            Okunmamış ({unreadCount})
          </Link>
        </nav>
        {unreadCount > 0 && (
          <form action={markAllAction}>
            <button type="submit" className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50">
              <CheckCheck className="h-4 w-4" aria-hidden /> Tümünü okundu say
            </button>
          </form>
        )}
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-neutral-500">
            <Bell className="h-6 w-6 text-neutral-300" aria-hidden />
            {unreadOnly ? "Okunmamış bildirimin yok." : "Henüz bildirimin yok."}
          </div>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {items.map((n) => (
              <li key={n.id} className="group relative">
                <form action={dismissAction} className="absolute right-2 top-2 z-10">
                  <input type="hidden" name="id" value={n.id} />
                  <button
                    type="submit"
                    title="Bildirimi kaldır"
                    aria-label={`Bildirimi kaldır: ${n.title}`}
                    className="rounded p-0.5 text-neutral-300 hover:bg-neutral-100 hover:text-red-600"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </form>
                <form action={openAction}>
                  <input type="hidden" name="id" value={n.id} />
                  <input type="hidden" name="link" value={n.link ?? ""} />
                  <button type="submit" className="flex w-full gap-3 py-3.5 pl-5 pr-10 text-left hover:bg-neutral-50">
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-brand-600"}`}
                      aria-label={n.readAt ? undefined : "okunmamış"}
                    />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm ${n.readAt ? "text-neutral-600" : "font-medium text-neutral-900"}`}>{n.title}</span>
                      {n.body && <span className="mt-0.5 block text-sm text-neutral-500">{n.body}</span>}
                      <span className="mt-1 block text-xs text-neutral-400">
                        {NOTIFICATION_TYPES[n.type as NotificationType]?.label ?? n.type} · {formatDateTime(n.createdAt)}
                      </span>
                    </span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="mt-3 text-xs text-neutral-500">
        <Link href="/account#bildirimler" className="text-brand-700 hover:underline">
          Bildirim tercihleri
        </Link>
      </p>
    </PageShell>
  );
}
