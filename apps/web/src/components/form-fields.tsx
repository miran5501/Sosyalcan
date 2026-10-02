import type { ReactNode } from "react";
import { Nav } from "@/components/nav";

/** Ortak form görünümü: yeni eklenen ekranlarda tekrar eden sınıf metinlerini tek yerde tutar. */
export const inputClass =
  "mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-neutral-100 disabled:text-neutral-500";

export function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-neutral-700">
        {label}
      </label>
      {children}
    </div>
  );
}

/** Seçim kutusu için boş ("— Seçilmedi —") seçenek + verilen kayıtlar. */
export function OptionList({ items }: { items: { id: string; name: string }[] }) {
  return (
    <>
      <option value="">— Seçilmedi —</option>
      {items.map((i) => (
        <option key={i.id} value={i.id}>
          {i.name}
        </option>
      ))}
    </>
  );
}

export function PageShell({
  user,
  title,
  width = "max-w-lg",
  children,
}: {
  user: { name?: string | null; role: string };
  title: string;
  width?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 lg:pl-64 print:pl-0">
      <Nav userName={user.name} userRole={user.role} />
      <main className={`animate-fade-up mx-auto w-full ${width} flex-1 px-4 py-8`}>
        {/* Başlık boşsa sayfa kendi PageHeader'ını kullanır. */}
        {title && <h1 className="text-xl font-semibold tracking-tight text-neutral-900">{title}</h1>}
        {children}
      </main>
    </div>
  );
}

export function SubmitButton({ children }: { children: ReactNode }) {
  return (
    <button type="submit" className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-on-brand hover:bg-brand-700">
      {children}
    </button>
  );
}

/** Seçim listesinde, mevcut kaydın (örn. arşivlenmiş müşteri, devre dışı kullanıcı) kaybolmaması için başa ekler. */
type Named = { id: string; name: string };
export function withCurrent(items: Named[], current?: Named | null): Named[] {
  return current && !items.some((i) => i.id === current.id) ? [{ id: current.id, name: current.name }, ...items] : items;
}

/** Çoklu seçim (onay kutuları). Aynı `name` ile gönderilen değerler `formData.getAll(name)` ile okunur. */
export function CheckboxGroup({
  name,
  legend,
  items,
  selectedIds = [],
}: {
  name: string;
  legend: string;
  items: { id: string; name: string }[];
  selectedIds?: string[];
}) {
  return (
    <fieldset>
      <legend className="block text-sm font-medium text-neutral-700">{legend}</legend>
      <div className="mt-1 grid grid-cols-1 gap-1.5 rounded-md sm:grid-cols-2 border border-neutral-300 bg-white p-3">
        {items.length === 0 && <span className="text-sm text-neutral-400">Seçilebilecek kayıt yok</span>}
        {items.map((i) => (
          <label key={i.id} className="flex items-center gap-2 text-sm text-neutral-800">
            <input type="checkbox" name={name} value={i.id} defaultChecked={selectedIds.includes(i.id)} />
            {i.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
