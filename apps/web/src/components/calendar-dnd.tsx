"use client";

import Link from "next/link";
import { createContext, useContext, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { moveCalendarItemAction } from "@/app/calendar/actions";
import type { MovableKind } from "@/lib/services/calendar-service";

/**
 * Takvimde sürükle-bırak: görev / çekim / randevu başka bir güne bırakılınca tarihi değişir
 * (saat aynı kalır). Yalnızca düzenleme yetkisi olan roller sürükleyebilir; ödeme vadeleri sürüklenmez.
 */
type Move = { kind: MovableKind; id: string };
const DATA_TYPE = "application/x-sosyalcan-calendar";

type Ctx = { enabled: boolean; pending: boolean; drop: (move: Move, dayKey: string) => void; error: string | null };
const DndContext = createContext<Ctx>({ enabled: false, pending: false, drop: () => undefined, error: null });

export function CalendarDnd({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function drop(move: Move, dayKey: string) {
    setError(null);
    startTransition(async () => {
      const result = await moveCalendarItemAction(move.kind, move.id, dayKey);
      if (result.error) setError(result.error);
      router.refresh();
    });
  }

  return (
    <DndContext.Provider value={{ enabled, pending, drop, error }}>
      {enabled && (
        <p className="mt-3 text-xs text-neutral-500">
          Kayıtları sürükleyerek başka güne taşıyabilirsin.
          {pending && <span className="ml-2 text-brand-600">Kaydediliyor…</span>}
        </p>
      )}
      {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className={pending ? "pointer-events-none opacity-70 transition-opacity" : undefined}>{children}</div>
    </DndContext.Provider>
  );
}

/** Takvim kutusundaki kayıt. `move` varsa (ve yetki varsa) sürüklenebilir; tıklayınca kaydı açar. */
export function CalendarChip({ href, title, className, move, children }: { href: string; title: string; className: string; move?: Move; children: ReactNode }) {
  const { enabled } = useContext(DndContext);
  const canDrag = enabled && Boolean(move);
  return (
    <Link
      href={href}
      title={canDrag ? `${title} — sürükleyerek başka güne taşı` : title}
      draggable={canDrag}
      onDragStart={(event) => {
        if (!canDrag || !move) {
          event.preventDefault(); // ödeme vadesi gibi taşınamayan kayıtta tarayıcının bağlantı sürüklemesi de olmasın
          return;
        }
        event.dataTransfer.setData(DATA_TYPE, JSON.stringify(move));
        event.dataTransfer.effectAllowed = "move";
      }}
      className={`${className} ${canDrag ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      {children}
    </Link>
  );
}

/** Bırakma alanı: takvimin bir günü. Üzerine gelince vurgulanır. */
export function CalendarDay({ dayKey, className, children }: { dayKey: string; className: string; children: ReactNode }) {
  const { enabled, drop } = useContext(DndContext);
  const [over, setOver] = useState(false);
  if (!enabled || !dayKey) return <div className={className}>{children}</div>; // ayın dışındaki boş kutular
  return (
    <div
      data-day={dayKey}
      className={over ? `${className.replace("bg-white", "")} bg-brand-50 ring-2 ring-inset ring-brand-400` : className}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(DATA_TYPE)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={(event) => {
        // İçerideki bir kayda geçerken de "ayrıldı" olayı gelir; gerçekten kutudan çıkınca vurgu kalksın.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(event) => {
        setOver(false);
        const raw = event.dataTransfer.getData(DATA_TYPE);
        if (!raw) return;
        event.preventDefault();
        drop(JSON.parse(raw) as Move, dayKey);
      }}
    >
      {children}
    </div>
  );
}
