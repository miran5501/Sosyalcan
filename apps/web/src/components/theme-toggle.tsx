"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { THEME_STORAGE_KEY as STORAGE_KEY } from "@/lib/theme";

type Theme = "light" | "dark" | "system";

function applyTheme(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

const OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Açık", Icon: Sun },
  { value: "dark", label: "Koyu", Icon: Moon },
  { value: "system", label: "Sistem", Icon: Monitor },
];

/** Açık / Koyu / Sistem seçimi; tercih bu tarayıcıda saklanır. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
      // Kayıtlı tercih yalnızca tarayıcıda okunabilir; sunucu çıktısı "Sistem" ile başlar.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setTheme(saved);
    } catch {
      /* gizli sekme vb.: tercih saklanamaz, sistem ayarı geçerli */
    }
  }, []);

  function choose(next: Theme) {
    setTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* saklanamazsa yalnızca bu oturumda geçerli */
    }
    applyTheme(next);
  }

  return (
    <div role="radiogroup" aria-label="Tema" className="flex rounded-lg bg-neutral-100 p-0.5">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          onClick={() => choose(value)}
          title={label}
          className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 text-xs ${
            theme === value ? "bg-white font-medium text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-800"
          }`}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}
