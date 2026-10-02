import { API_URL } from "./config";

/**
 * Mobilde yakalanmayan JavaScript hatalarını sunucunun hata takibine bildirir
 * (web'de Ayarlar → Sistem Durumu). Varsayılan davranış (geliştirmede kırmızı ekran,
 * üretimde uygulamanın kapanması) değişmez; yalnızca önce bildirim gönderilir.
 */
type Handler = (error: Error, isFatal?: boolean) => void;
type ErrorUtilsShape = { getGlobalHandler: () => Handler; setGlobalHandler: (handler: Handler) => void };

let installed = false;

export function installErrorReporting() {
  const errorUtils = (globalThis as unknown as { ErrorUtils?: ErrorUtilsShape }).ErrorUtils;
  if (installed || !errorUtils) return;
  installed = true;
  const previous = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    void fetch(`${API_URL}/api/client-errors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "mobile",
        message: `${isFatal ? "[ölümcül] " : ""}${error?.message ?? String(error)}`.slice(0, 1000),
        stack: error?.stack?.slice(0, 4000),
      }),
    }).catch(() => undefined);
    previous(error, isFatal);
  });
}
