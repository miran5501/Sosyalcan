import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as SecureStore from "expo-secure-store";
import * as Device from "expo-device";
import { api, ApiError, setSession, setSessionHandlers, type Session } from "./api";
import type { User } from "./types";

/** Access + refresh token çifti, cihazın güvenli deposunda (Keystore/Keychain) tutulur. */
const SESSION_KEY = "sosyalcan.session";
const DEVICE_KEY = "sosyalcan.device";

/**
 * Bu telefonun kalıcı, rastgele kimliği ("yeni cihazdan giriş" uyarısı için). Çıkışta silinmez;
 * uygulama silinince kaybolur ve sonraki giriş yeni cihaz sayılır.
 */
/** Telefonun okunur adı: "Samsung SM-S918B · Android 14", "Apple iPhone 15 · iOS 18.0" (kişisel ad içermez). */
function deviceName(): string | undefined {
  const brand = Device.manufacturer ? Device.manufacturer.charAt(0).toUpperCase() + Device.manufacturer.slice(1) : "";
  const model = Device.modelName ?? "";
  const name = model.toLowerCase().startsWith(brand.toLowerCase()) ? model : `${brand} ${model}`.trim();
  const os = [Device.osName, Device.osVersion].filter(Boolean).join(" ");
  return [name, os].filter(Boolean).join(" · ") || undefined;
}

async function deviceId(): Promise<string | undefined> {
  try {
    const existing = await SecureStore.getItemAsync(DEVICE_KEY);
    if (existing) return existing;
    const bytes = new Uint8Array(18);
    // Gizli bir değer değil (yalnızca cihazı ayırt eder); güvenli rastgele yoksa Math.random yeterli.
    if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    const id = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    await SecureStore.setItemAsync(DEVICE_KEY, id);
    return id;
  } catch {
    return undefined;
  }
}
/** Eski sürümün tek (30 günlük) token'ı; artık kullanılmıyor, açılışta silinir. */
const LEGACY_TOKEN_KEY = "sosyalcan.token";

type AuthState = {
  /** Kayıtlı oturum kontrol edilirken true (açılış ekranı). */
  restoring: boolean;
  user: User | null;
  /** Ekranların "oturum var mı" kontrolü ve API çağrıları için; yenilenen token'ı api.ts takip eder. */
  token: string | null;
  /** Giriş ekranında gösterilecek bilgi (ör. "şifren değişti, yeniden giriş yap"). */
  notice: string | null;
  /** "2fa" dönerse kod adımı bekleniyor: `verifyTwoFactor(code)` çağrılır. */
  login: (email: string, password: string) => Promise<"ok" | "2fa">;
  verifyTwoFactor: (code: string) => Promise<void>;
  /** E-postayla doğrulamada kodu yeniden gönderir. */
  resendTwoFactorCode: () => Promise<void>;
  /** Kod adımından vazgeç (giriş ekranına dön). */
  cancelTwoFactor: () => void;
  twoFactorPending: boolean;
  /** Bekleyen ikinci adımın yöntemi: doğrulama uygulaması ya da e-postaya gelen kod. */
  twoFactorMethod: "APP" | "EMAIL" | null;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

async function saveSession(session: Session) {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

async function readSession(): Promise<Session | null> {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Session;
    return parsed.accessToken && parsed.refreshToken ? parsed : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [restoring, setRestoring] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [challengeMethod, setChallengeMethod] = useState<"APP" | "EMAIL">("APP");

  const clearLocal = useCallback(async () => {
    setSession(null);
    setUser(null);
    setToken(null);
    await SecureStore.deleteItemAsync(SESSION_KEY);
  }, []);

  const logout = useCallback(async () => {
    const stored = await readSession();
    await clearLocal();
    if (stored) {
      await api.logout(stored.refreshToken); // sunucuda da iptal et (çevrimdışıysa sessizce geç)
    }
  }, [clearLocal]);

  // Uygulama açılışında: saklı oturum varsa sunucuda doğrula (gerekirse token kendiliğinden yenilenir).
  useEffect(() => {
    (async () => {
      try {
        await SecureStore.deleteItemAsync(LEGACY_TOKEN_KEY);
        const stored = await readSession();
        if (stored) {
          setSession(stored);
          setUser(await api.me(stored.accessToken));
          setToken(stored.accessToken);
        }
      } catch (error) {
        // Oturum geri getirilemediyse temizle; sunucuya ulaşılamıyorsa (ağ) oturumu koru ve giriş ekranına düş.
        if (error instanceof ApiError && error.status === 401) {
          await clearLocal();
        }
      } finally {
        setRestoring(false);
      }
    })();
  }, [clearLocal]);

  useEffect(() => {
    setSessionHandlers({
      onChange: (session) => void saveSession(session),
      onUnauthorized: () => void clearLocal(),
    });
    return () => setSessionHandlers(null);
  }, [clearLocal]);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      await api.changePassword(token ?? "", currentPassword, newPassword);
      // Sunucu tüm oturumları kapattı: yerel oturumu da temizle, giriş ekranında bilgi ver.
      await clearLocal();
      setNotice("Şifren değiştirildi. Yeni şifrenle giriş yap.");
    },
    [token, clearLocal],
  );

  const startSession = useCallback(async (result: Session & { user: User }) => {
    const session = { accessToken: result.accessToken, refreshToken: result.refreshToken };
    setSession(session);
    await saveSession(session);
    setToken(result.accessToken);
    setUser(result.user);
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<"ok" | "2fa"> => {
      setNotice(null);
      const result = await api.login(email.trim(), password, await deviceId(), deviceName());
      if ("twoFactorRequired" in result) {
        setChallenge(result.challengeToken);
        setChallengeMethod(result.method ?? "APP");
        return "2fa";
      }
      await startSession(result);
      return "ok";
    },
    [startSession],
  );

  const verifyTwoFactor = useCallback(
    async (code: string) => {
      if (!challenge) throw new Error("Doğrulama süresi doldu, yeniden giriş yapın");
      const result = await api.verifyTwoFactor(challenge, code.trim(), await deviceId(), deviceName());
      setChallenge(null);
      await startSession(result);
    },
    [challenge, startSession],
  );

  const resendTwoFactorCode = useCallback(async () => {
    if (!challenge) throw new Error("Doğrulama süresi doldu, yeniden giriş yapın");
    await api.resendTwoFactorCode(challenge);
  }, [challenge]);

  const cancelTwoFactor = useCallback(() => setChallenge(null), []);

  const value = useMemo(
    () => ({
      restoring,
      user,
      token,
      notice,
      login,
      logout,
      changePassword,
      verifyTwoFactor,
      resendTwoFactorCode,
      cancelTwoFactor,
      twoFactorPending: challenge !== null,
      twoFactorMethod: challenge !== null ? challengeMethod : null,
    }),
    [restoring, user, token, notice, login, logout, changePassword, verifyTwoFactor, resendTwoFactorCode, cancelTwoFactor, challenge, challengeMethod],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth, AuthProvider içinde kullanılmalı");
  return ctx;
}
