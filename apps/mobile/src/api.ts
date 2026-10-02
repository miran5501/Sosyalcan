import { API_URL } from "./config";
import type {
  AppNotification,
  Appointment,
  ChecklistItem,
  Dashboard,
  Option,
  Shoot,
  Task,
  TaskComment,
  TaskLink,
  User,
} from "./types";

const REQUEST_TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Oturum: kısa ömürlü access token (15 dk) + tek kullanımlık refresh token.
 * Access token'ın süresi dolunca istek 401 alır; burada refresh token ile
 * sessizce yenisi alınır ve istek bir kez tekrarlanır. Kullanıcı bunu fark etmez.
 * Yenileme de başarısız olursa (hesap kapatıldı, şifre değişti, 30 gün geçti) oturum kapanır.
 */
export type Session = { accessToken: string; refreshToken: string };

let session: Session | null = null;
/** Yeni token çifti geldiğinde (SecureStore'a yazmak için) AuthProvider tarafından ayarlanır. */
let onSessionChange: ((session: Session) => void) | null = null;
/** Oturum geri getirilemediğinde (giriş ekranına dönmek için) AuthProvider tarafından ayarlanır. */
let onUnauthorized: (() => void) | null = null;

export function setSession(next: Session | null) {
  session = next;
}
export function setSessionHandlers(handlers: { onChange: (s: Session) => void; onUnauthorized: () => void } | null) {
  onSessionChange = handlers?.onChange ?? null;
  onUnauthorized = handlers?.onUnauthorized ?? null;
}

async function send(path: string, options: { method?: string; body?: unknown; accessToken?: string | null }) {
  // fetch'in varsayılan zaman aşımı yok: sunucu kapalıyken ekran sonsuza dek yükleniyor görünürdü.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${API_URL}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, "Sunucuya ulaşılamadı. Bağlantınızı kontrol edin.");
  } finally {
    clearTimeout(timer);
  }
}

// Aynı anda birkaç istek 401 alırsa tek bir yenileme yapılır (refresh token tek kullanımlık).
let refreshing: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    const refreshToken = session?.refreshToken;
    if (!refreshToken) return false;
    const response = await send("/api/mobile/refresh", { method: "POST", body: { refreshToken } });
    if (!response.ok) return false;
    const data = (await response.json()) as Session;
    session = { accessToken: data.accessToken, refreshToken: data.refreshToken };
    onSessionChange?.(session);
    return true;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/**
 * `token` verilen istekler kimlik ister: o anki (gerekirse yenilenmiş) access token kullanılır.
 * Ekranlar token'ı parametre olarak geçmeye devam eder; yenilenen token'ı burası takip eder.
 */
async function request<T>(path: string, options: { method?: string; body?: unknown; token?: string | null } = {}) {
  const authenticated = Boolean(options.token);
  const tokenFor = () => (authenticated ? (session?.accessToken ?? options.token) : null);

  let response = await send(path, { ...options, accessToken: tokenFor() });
  if (response.status === 401 && authenticated) {
    if (await refreshSession()) {
      response = await send(path, { ...options, accessToken: tokenFor() });
    }
    if (response.status === 401) {
      onUnauthorized?.();
    }
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, data?.error ?? "Beklenmeyen bir hata oluştu");
  }
  return data as T;
}

export const api = {
  /** 2FA açıksa token yerine `{ twoFactorRequired, method, challengeToken }` döner (EMAIL: kod e-postaya gitti). */
  login: (email: string, password: string, deviceId?: string, deviceName?: string) =>
    request<(Session & { user: User }) | { twoFactorRequired: true; method?: "APP" | "EMAIL"; challengeToken: string }>("/api/mobile/login", {
      method: "POST",
      body: { email, password, deviceId, deviceName },
    }),
  verifyTwoFactor: (challengeToken: string, code: string, deviceId?: string, deviceName?: string) =>
    request<Session & { user: User }>("/api/mobile/login/verify", { method: "POST", body: { challengeToken, code, deviceId, deviceName } }),
  /** E-postayla doğrulamada kodu yeniden gönderir (204). */
  resendTwoFactorCode: (challengeToken: string) =>
    request<null>("/api/mobile/login/resend", { method: "POST", body: { challengeToken } }),
  /** Sunucudaki oturumu (bu cihazın refresh token'ını) iptal eder; ağ hatası yok sayılır. */
  logout: (refreshToken: string) =>
    send("/api/mobile/logout", { method: "POST", body: { refreshToken } }).then(
      () => undefined,
      () => undefined,
    ),
  me: (token: string) => request<User>("/api/mobile/me", { token }),
  /** Başarılı olunca sunucu bu cihaz dahil tüm oturumları kapatır (204). */
  changePassword: (token: string, currentPassword: string, newPassword: string) =>
    request<null>("/api/account/password", { method: "POST", body: { currentPassword, newPassword }, token }),
  dashboard: (token: string) => request<Dashboard>("/api/dashboard", { token }),
  tasks: (token: string) => request<Task[]>("/api/tasks", { token }),
  updateTaskStatus: (token: string, id: string, statusId: string) =>
    request<Task>(`/api/tasks/${id}/status`, { method: "PATCH", body: { statusId }, token }),
  taskComments: (token: string, id: string) => request<TaskComment[]>(`/api/tasks/${id}/comments`, { token }),
  addTaskComment: (token: string, id: string, body: string) =>
    request<TaskComment>(`/api/tasks/${id}/comments`, { method: "POST", body: { body }, token }),
  taskLinks: (token: string, id: string) => request<TaskLink[]>(`/api/tasks/${id}/links`, { token }),
  shoots: (token: string, from: string) => request<Shoot[]>(`/api/shoots?from=${encodeURIComponent(from)}`, { token }),
  updateDeliveryStatus: (token: string, id: string, deliveryStatusId: string) =>
    request<Shoot>(`/api/shoots/${id}`, { method: "PATCH", body: { deliveryStatusId }, token }),
  notifications: (token: string, options: { unreadOnly?: boolean } = {}) =>
    request<{ items: AppNotification[]; unreadCount: number }>(`/api/notifications${options.unreadOnly ? "?unread=1" : ""}`, { token }),
  /** Bildirimi listeden kaldırır (204). */
  dismissNotification: (token: string, id: string) => request<null>(`/api/notifications/${id}`, { method: "DELETE", token }),
  markNotificationsRead: (token: string, target: { ids?: string[]; all?: boolean }) =>
    request<{ updated: number; unreadCount: number }>("/api/notifications/read", { method: "POST", body: target, token }),
  toggleChecklistItem: (token: string, shootId: string, itemId: string, done: boolean) =>
    request<ChecklistItem>(`/api/shoots/${shootId}/checklist/${itemId}`, { method: "PATCH", body: { done }, token }),
  options: (token: string, kind: Option["kind"]) => request<Option[]>(`/api/options?kind=${kind}`, { token }),
  appointments: (token: string, from: string) =>
    request<Appointment[]>(`/api/appointments?from=${encodeURIComponent(from)}`, { token }),
};
