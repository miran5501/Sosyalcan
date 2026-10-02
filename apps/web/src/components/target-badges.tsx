import { targetLabel } from "@/lib/options";

type Target = { id: string; label: string; parent?: { label: string } | null };

/** Paylaşım yerlerini (veya ekipmanları) küçük rozetler olarak gösterir: "Instagram · Reels". */
export function TargetBadges({ targets }: { targets: Target[] }) {
  if (targets.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {targets.map((t) => (
        <span key={t.id} className="rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-xs text-neutral-600">
          {targetLabel(t)}
        </span>
      ))}
    </span>
  );
}
