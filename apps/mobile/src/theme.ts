import { Appearance } from "react-native";

/**
 * Web arayüzüyle aynı renk ailesi (marka rengi: lacivert-mor). Uygulama telefonun açık/koyu
 * ayarına göre açılır; stiller açılışta bir kez oluşturulduğu için tema değişikliği uygulama
 * yeniden açılınca geçerli olur (app.json: userInterfaceStyle "automatic").
 */
export const isDark = Appearance.getColorScheme() === "dark";

const light = {
  bg: "#f6f7fb",
  card: "#ffffff",
  border: "#e5e7eb",
  text: "#171717",
  textMuted: "#6b7280",
  textFaint: "#9ca3af",
  primary: "#4f46e5",
  onPrimary: "#ffffff",
  primarySoft: "#eef2ff",
  green: "#15803d",
  red: "#b91c1c",
  amber: "#b45309",
  redBg: "#fef2f2",
  amberBg: "#fffbeb",
  greenBg: "#f0fdf4",
  neutralBg: "#f3f4f6",
  link: "#4338ca",
  inputBorder: "#d1d5db",
  backdrop: "rgba(0,0,0,0.35)",
};

const dark: typeof light = {
  bg: "#0d0f14",
  card: "#161a22",
  border: "#2a303c",
  text: "#f1f3f6",
  textMuted: "#98a0ae",
  textFaint: "#6b7383",
  primary: "#6366f1",
  onPrimary: "#ffffff",
  primarySoft: "#1e1b4b",
  green: "#4ade80",
  red: "#f87171",
  amber: "#fbbf24",
  redBg: "#2a1417",
  amberBg: "#2a2010",
  greenBg: "#10251a",
  neutralBg: "#1e232d",
  link: "#a5b4fc",
  inputBorder: "#3a414f",
  backdrop: "rgba(0,0,0,0.6)",
};

export const colors = isDark ? dark : light;

/** Web'deki seçenek rozet renkleriyle aynı aile (admin teslim durumlarına renk seçer). */
const OPTION_COLORS: Record<string, { color: string; backgroundColor: string }> = isDark
  ? {
      neutral: { color: colors.textMuted, backgroundColor: colors.neutralBg },
      blue: { color: "#93c5fd", backgroundColor: "#111f36" },
      amber: { color: "#fcd34d", backgroundColor: colors.amberBg },
      green: { color: "#86efac", backgroundColor: colors.greenBg },
      red: { color: "#fca5a5", backgroundColor: colors.redBg },
      purple: { color: "#d8b4fe", backgroundColor: "#221535" },
    }
  : {
      neutral: { color: colors.textMuted, backgroundColor: colors.neutralBg },
      blue: { color: "#1d4ed8", backgroundColor: "#eff6ff" },
      amber: { color: colors.amber, backgroundColor: colors.amberBg },
      green: { color: colors.green, backgroundColor: colors.greenBg },
      red: { color: colors.red, backgroundColor: colors.redBg },
      purple: { color: "#7e22ce", backgroundColor: "#faf5ff" },
    };

export const optionColor = (key?: string | null) => OPTION_COLORS[key ?? "neutral"] ?? OPTION_COLORS.neutral;
