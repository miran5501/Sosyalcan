import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { ReactNode } from "react";
import type { OptionKind } from "@prisma/client";
import { ZodError } from "zod";
import { auth } from "@/auth";
import { PageShell } from "@/components/form-fields";
import { ApiError, requireRole } from "@/lib/api-auth";
import {
  OPTION_COLORS,
  OPTION_COLOR_KEYS,
  OPTION_KIND_CONFIG,
  OPTION_TABS,
  type OptionTab,
  badgeClass,
} from "@/lib/options";
import { ADMIN_ONLY } from "@/lib/roles";
import {
  archiveOption,
  createOption,
  getOptionGroups,
  moveOption,
  restoreOption,
  updateOption,
} from "@/lib/services/option-service";
import { createOptionSchema, moveOptionSchema, updateOptionSchema } from "@/lib/validations/option";

const PATH = "/settings/options";

/** Servis/validasyon hatasını sayfada gösterilecek mesaja çevirir; bilinmeyen hatalar yeniden fırlatılır. */
function toMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof ZodError) return error.issues[0]?.message ?? "Geçersiz veri";
  throw error;
}

async function runAction(formData: FormData, action: () => Promise<unknown>) {
  const tab = String(formData.get("tab") ?? "tasks");
  let message: string | null = null;
  try {
    await requireRole(ADMIN_ONLY);
    await action();
  } catch (error) {
    message = toMessage(error);
  }
  // Seçenekler görev, çekim, finans formlarında ve listelerde kullanılır.
  revalidatePath("/", "layout");
  redirect(`${PATH}?tab=${encodeURIComponent(tab)}${message ? `&error=${encodeURIComponent(message)}` : "&ok=1"}`);
}

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "");

async function createAction(formData: FormData) {
  "use server";
  await runAction(formData, () =>
    createOption(
      createOptionSchema.parse({
        kind: formData.get("kind"),
        label: text(formData, "label"),
        color: text(formData, "color"),
        isDone: formData.get("isDone") ?? undefined,
        parentId: formData.get("parentId") || undefined,
      }),
    ),
  );
}

async function updateAction(formData: FormData) {
  "use server";
  await runAction(formData, () =>
    updateOption(
      text(formData, "id"),
      updateOptionSchema.parse({
        label: text(formData, "label"),
        ...(formData.has("color") ? { color: text(formData, "color") } : {}),
        // Onay kutusu işaretliyse "on", değilse arkasındaki gizli alanın "false" değeri gelir.
        ...(formData.has("isDone") ? { isDone: formData.get("isDone") } : {}),
      }),
    ),
  );
}

async function moveAction(formData: FormData) {
  "use server";
  await runAction(formData, async () => {
    const { direction } = moveOptionSchema.parse({ direction: formData.get("direction") });
    await moveOption(text(formData, "id"), direction);
  });
}

async function archiveAction(formData: FormData) {
  "use server";
  await runAction(formData, () => archiveOption(text(formData, "id")));
}

async function restoreAction(formData: FormData) {
  "use server";
  await runAction(formData, () => restoreOption(text(formData, "id")));
}

// Telefonda ad kutusu tam satır, renk/işaret/düğmeler alt satıra iner; geniş ekranda tek satır.
const smallInput =
  "w-full min-w-0 rounded-md sm:w-auto sm:flex-1 border border-neutral-300 bg-white px-2.5 py-1.5 text-sm text-neutral-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";
const iconButton =
  "rounded-md border border-neutral-200 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-30";

type Row = { id: string; label: string; color: string | null; isDone: boolean; kind: OptionKind };

function TabInput({ tab }: { tab: OptionTab }) {
  return <input type="hidden" name="tab" value={tab} />;
}

function ColorSelect({ value }: { value?: string | null }) {
  return (
    <select
      name="color"
      defaultValue={value ?? "neutral"}
      aria-label="Renk"
      className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900"
    >
      {OPTION_COLOR_KEYS.map((key) => (
        <option key={key} value={key}>
          {OPTION_COLORS[key].label}
        </option>
      ))}
    </select>
  );
}

function DoneCheckbox({ checked }: { checked?: boolean }) {
  return (
    <label className="flex shrink-0 items-center gap-1 text-xs text-neutral-600" title="Bu sütundaki görev tamamlanmış sayılır">
      <input type="checkbox" name="isDone" defaultChecked={checked} />
      <input type="hidden" name="isDone" value="false" />
      Tamamlandı sayılır
    </label>
  );
}

/** Bir seçeneğin satırı: ad (renk, tamamlandı işareti) düzenleme, yukarı/aşağı taşıma, kaldırma. */
function OptionRow({ item, first, last, tab }: { item: Row; first: boolean; last: boolean; tab: OptionTab }) {
  const config = OPTION_KIND_CONFIG[item.kind];
  return (
    <li className="flex flex-wrap items-center gap-2 py-2">
      <form action={updateAction} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <TabInput tab={tab} />
        <input type="hidden" name="id" value={item.id} />
        {config.hasColor && (
          <span className={`hidden shrink-0 rounded-full px-2 py-0.5 text-xs sm:inline ${badgeClass(item.color)}`}>{item.label}</span>
        )}
        <input name="label" defaultValue={item.label} required maxLength={40} aria-label="Ad" className={smallInput} />
        {config.hasColor && <ColorSelect value={item.color} />}
        {config.hasDoneFlag && <DoneCheckbox checked={item.isDone} />}
        <button type="submit" className="text-xs text-neutral-600 hover:text-neutral-900 hover:underline">
          Kaydet
        </button>
      </form>
      <div className="flex items-center gap-1">
        {(["up", "down"] as const).map((direction) => (
          <form key={direction} action={moveAction}>
            <TabInput tab={tab} />
            <input type="hidden" name="id" value={item.id} />
            <input type="hidden" name="direction" value={direction} />
            <button
              type="submit"
              disabled={direction === "up" ? first : last}
              className={iconButton}
              aria-label={direction === "up" ? "Yukarı taşı" : "Aşağı taşı"}
              title={direction === "up" ? "Yukarı taşı" : "Aşağı taşı"}
            >
              {direction === "up" ? "↑" : "↓"}
            </button>
          </form>
        ))}
        <form action={archiveAction}>
          <TabInput tab={tab} />
          <input type="hidden" name="id" value={item.id} />
          <button type="submit" className="px-2 py-1 text-xs text-red-600 hover:text-red-800">
            Kaldır
          </button>
        </form>
      </div>
    </li>
  );
}

function AddForm({ kind, parentId, placeholder, tab }: { kind: OptionKind; parentId?: string; placeholder: string; tab: OptionTab }) {
  const config = OPTION_KIND_CONFIG[kind];
  return (
    <form action={createAction} className="mt-2 flex flex-wrap items-center gap-2">
      <TabInput tab={tab} />
      <input type="hidden" name="kind" value={kind} />
      {parentId && <input type="hidden" name="parentId" value={parentId} />}
      <input name="label" required maxLength={40} placeholder={placeholder} aria-label={placeholder} className={smallInput} />
      {config.hasColor && <ColorSelect />}
      {config.hasDoneFlag && <DoneCheckbox />}
      <button type="submit" className="shrink-0 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-on-brand hover:bg-brand-700">
        + Ekle
      </button>
    </form>
  );
}

function Section({ kind, children }: { kind: OptionKind; children: ReactNode }) {
  const config = OPTION_KIND_CONFIG[kind];
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm p-5">
      <h2 className="text-sm font-semibold text-neutral-900">{config.title}</h2>
      <p className="mt-0.5 text-xs text-neutral-500">{config.hint}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Düz liste (görev durumu, çekim türü, teslim durumu, finans kategorisi). */
function FlatList({ kind, items, tab }: { kind: OptionKind; items: Row[]; tab: OptionTab }) {
  return (
    <Section kind={kind}>
      {items.length === 0 && <p className="rounded-md bg-neutral-50 px-3 py-3 text-sm text-neutral-500">Liste boş.</p>}
      <ul className="divide-y divide-neutral-100">
        {items.map((o, i) => (
          <OptionRow key={o.id} item={o} first={i === 0} last={i === items.length - 1} tab={tab} />
        ))}
      </ul>
      <AddForm kind={kind} placeholder={`Yeni ${OPTION_KIND_CONFIG[kind].single}`} tab={tab} />
    </Section>
  );
}

/** İki seviyeli liste: platform → paylaşım türleri, ekipman kategorisi → ekipmanlar. */
function NestedList({
  kind,
  childKind,
  groups,
  empty,
  tab,
}: {
  kind: OptionKind;
  childKind: OptionKind;
  groups: (Row & { children: Row[] })[];
  empty: string;
  tab: OptionTab;
}) {
  const childName = OPTION_KIND_CONFIG[childKind].single;
  return (
    <Section kind={kind}>
      {groups.length === 0 && <p className="rounded-md bg-neutral-50 px-3 py-3 text-sm text-neutral-500">{empty}</p>}
      <div className="space-y-3">
        {groups.map((g, i) => (
          <div key={g.id} className="rounded-lg border border-neutral-200 p-3">
            <ul>
              <OptionRow item={g} first={i === 0} last={i === groups.length - 1} tab={tab} />
            </ul>
            <div className="ml-4 border-l-2 border-neutral-100 pl-3">
              {g.children.length === 0 && <p className="py-1 text-xs text-neutral-400">Henüz {childName} yok</p>}
              <ul className="divide-y divide-neutral-100">
                {g.children.map((c, j) => (
                  <OptionRow key={c.id} item={c} first={j === 0} last={j === g.children.length - 1} tab={tab} />
                ))}
              </ul>
              <AddForm kind={childKind} parentId={g.id} placeholder={`${g.label} için yeni ${childName}`} tab={tab} />
            </div>
          </div>
        ))}
      </div>
      <AddForm kind={kind} placeholder={`Yeni ${OPTION_KIND_CONFIG[kind].single}`} tab={tab} />
    </Section>
  );
}

export default async function OptionListsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; error?: string; ok?: string }>;
}) {
  const session = await auth();
  const user = session!.user;
  if (user.role !== "ADMIN") {
    redirect("/");
  }

  const params = await searchParams;
  const tab = (OPTION_TABS.find((t) => t.key === params.tab)?.key ?? "tasks") as OptionTab;
  const current = OPTION_TABS.find((t) => t.key === tab)!;

  const [active, all] = await Promise.all([getOptionGroups(), getOptionGroups(true)]);
  const kindsInTab = new Set<OptionKind>(
    current.kinds.flatMap((k) => [k, ...(Object.entries(OPTION_KIND_CONFIG).filter(([, c]) => c.parentKind === k).map(([ck]) => ck as OptionKind))]),
  );
  const archived = [
    ...all.taskStatuses,
    ...all.shootTypes,
    ...all.deliveryStatuses,
    ...all.platforms.flatMap((p) => [p, ...p.formats]),
    ...all.equipmentCategories.flatMap((c) => [c, ...c.items]),
    ...all.financeCategories,
    ...all.paymentMethods,
    ...all.deliveryChecklist,
  ].filter((o) => o.archivedAt && kindsInTab.has(o.kind));

  return (
    <PageShell user={user} title="Seçenek Listeleri" width="max-w-4xl">
      <p className="mt-1 text-sm text-neutral-500">
        Kaldırılan seçenek eski kayıtlarda görünmeye devam eder, yeni seçimlerde çıkmaz.
      </p>

      <nav className="mt-5 flex flex-wrap gap-1 border-b border-neutral-200" aria-label="Seçenek listeleri">
        {OPTION_TABS.map((t) => (
          <Link
            key={t.key}
            href={`${PATH}?tab=${t.key}`}
            aria-current={t.key === tab ? "page" : undefined}
            className={
              t.key === tab
                ? "-mb-px rounded-t-md border border-b-white border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-900"
                : "px-4 py-2 text-sm text-neutral-500 hover:text-neutral-900"
            }
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {params.error && (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{params.error}</p>
      )}
      {params.ok && !params.error && (
        <p className="mt-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">Değişiklik kaydedildi.</p>
      )}

      <div className="mt-5 space-y-5">
        {tab === "tasks" && <FlatList kind="TASK_STATUS" items={active.taskStatuses} tab={tab} />}
        {tab === "shoots" && (
          <>
            <FlatList kind="SHOOT_TYPE" items={active.shootTypes} tab={tab} />
            <FlatList kind="DELIVERY_STATUS" items={active.deliveryStatuses} tab={tab} />
            <FlatList kind="DELIVERY_CHECKLIST" items={active.deliveryChecklist} tab={tab} />
          </>
        )}
        {tab === "publish" && (
          <NestedList
            kind="PLATFORM"
            childKind="POST_FORMAT"
            groups={active.platforms.map((p) => ({ ...p, children: p.formats }))}
            empty="Henüz platform yok. Bir platform ekle, sonra altına o platformdaki paylaşım türlerini tanımla."
            tab={tab}
          />
        )}
        {tab === "equipment" && (
          <NestedList
            kind="EQUIPMENT_CATEGORY"
            childKind="EQUIPMENT"
            groups={active.equipmentCategories.map((c) => ({ ...c, children: c.items }))}
            empty="Henüz ekipman kategorisi yok. Bir kategori ekle (ör. Kamera), sonra altına ekipmanları gir."
            tab={tab}
          />
        )}
        {tab === "finance" && (
          <>
            <FlatList kind="FINANCE_CATEGORY" items={active.financeCategories} tab={tab} />
            <FlatList kind="PAYMENT_METHOD" items={active.paymentMethods} tab={tab} />
          </>
        )}

        {archived.length > 0 && (
          <details className="rounded-2xl border border-neutral-200 bg-white shadow-sm p-5">
            <summary className="cursor-pointer text-sm font-semibold text-neutral-900">Kaldırılan seçenekler ({archived.length})</summary>
            <ul className="mt-3 divide-y divide-neutral-100">
              {archived.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="text-neutral-600">
                    {o.parent ? `${o.parent.label} · ` : ""}
                    {o.label}
                    <span className="ml-2 text-xs text-neutral-400">{OPTION_KIND_CONFIG[o.kind].single}</span>
                  </span>
                  <form action={restoreAction}>
                    <TabInput tab={tab} />
                    <input type="hidden" name="id" value={o.id} />
                    <button type="submit" className="text-xs text-neutral-600 hover:text-neutral-900 hover:underline">
                      Geri al
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <Link href="/settings" className="mt-6 inline-block text-sm text-neutral-600 hover:text-neutral-900">
        ← Ayarlar
      </Link>
    </PageShell>
  );
}
