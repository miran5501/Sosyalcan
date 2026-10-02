import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { api } from "./api";
import { useAuth } from "./auth";

/**
 * Okunmamış bildirim sayısı (sekme rozeti). Dakikada bir ve uygulama öne geldiğinde yenilenir;
 * Bildirimler ekranı okundu işaretleyince sayıyı hemen günceller.
 */
type UnreadState = { unread: number; setUnread: (n: number) => void; refreshUnread: () => Promise<void> };
const UnreadContext = createContext<UnreadState | null>(null);

const POLL_MS = 60_000;

export function UnreadProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [unread, setUnread] = useState(0);

  const refreshUnread = useCallback(async () => {
    if (!token) return;
    try {
      setUnread((await api.notifications(token, { unreadOnly: true })).unreadCount);
    } catch {
      // ağ hatası: rozet eski değerinde kalır
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      setUnread(0);
      return;
    }
    void refreshUnread();
    const timer = setInterval(() => void refreshUnread(), POLL_MS);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshUnread();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [token, refreshUnread]);

  const value = useMemo(() => ({ unread, setUnread, refreshUnread }), [unread, refreshUnread]);
  return <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>;
}

export function useUnread() {
  const ctx = useContext(UnreadContext);
  if (!ctx) throw new Error("useUnread, UnreadProvider içinde kullanılmalı");
  return ctx;
}
