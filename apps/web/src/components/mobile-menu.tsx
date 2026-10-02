"use client";

import { Menu, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { NavLinks, type NavItem } from "@/components/nav-links";

/** Telefonda üst çubuktaki menü düğmesi: soldan açılan çekmece (menü + alt kısım: tema, kullanıcı, çıkış). */
export function MobileMenu({ items, footer }: { items: NavItem[]; footer: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Menüyü aç"
        aria-expanded={open}
        className="rounded-md p-2 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>
      {/* Üst çubuktaki bulanık arka plan (backdrop-blur) "fixed" öğeleri çubuğun içine hapseder; çekmece body'ye taşınır. */}
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-40 lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Menü"
          >
            <button
              type="button"
              aria-label="Menüyü kapat"
              className="absolute inset-0 bg-black/40"
              onClick={() => setOpen(false)}
            />
            <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-white shadow-xl">
              <div className="flex items-center justify-end p-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Menüyü kapat"
                  className="rounded-md p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-3">
                <NavLinks items={items} onNavigate={() => setOpen(false)} />
              </div>
              <div className="border-t border-neutral-200 p-3">{footer}</div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
