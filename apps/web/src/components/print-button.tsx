"use client";

/** Tarayıcının yazdır penceresini açar; oradan "PDF olarak kaydet" seçilerek PDF alınır. */
export function PrintButton({ label = "Yazdır / PDF" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100 print:hidden"
    >
      {label}
    </button>
  );
}
