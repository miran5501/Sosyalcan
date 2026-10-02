"use client";

import { useState } from "react";
import { Mail, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";

type Method = "APP" | "EMAIL";
type Status = { enabled: boolean; enabledAt: string | null; recoveryCodesLeft: number; method: Method | null };
type Setup = { method: "APP"; secret: string; qrDataUrl: string } | { method: "EMAIL"; email: string };

const input =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";
const primary = "rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-on-brand hover:bg-brand-700 disabled:opacity-60";
const secondary = "rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-60";
const link = "text-sm text-brand-600 hover:text-brand-700 disabled:opacity-60";

async function call(body: Record<string, string>) {
  const response = await fetch("/api/account/2fa", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "İşlem yapılamadı");
  return data;
}

const DEV_NOTE = "E-posta gönderimi kurulu değil; kod Ayarlar → Bildirimler ve E-posta → Giden kutusu'nda görünür.";

/**
 * Hesabım → İki adımlı doğrulama. İki yöntem: e-postaya gelen kod ya da doğrulama uygulaması.
 * Kur (ilk kodla doğrula), kurtarma kodlarını bir kez göster, yenile, kapat.
 */
export function TwoFactorPanel({
  initial,
  email,
  emailAvailable,
  emailDevMode,
}: {
  initial: Status;
  email: string;
  emailAvailable: boolean;
  emailDevMode: boolean;
}) {
  const [status, setStatus] = useState(initial);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [mode, setMode] = useState<"idle" | "disable" | "recovery">("idle");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "İşlem yapılamadı");
    } finally {
      setBusy(false);
    }
  }

  const startSetup = (method: Method) =>
    run(async () => {
      setSetup(await call({ action: "setup", method }));
      setCode("");
    });
  const confirm = () =>
    run(async () => {
      if (!setup) return;
      const result = await call({ action: "confirm", method: setup.method, code });
      setCodes(result.recoveryCodes);
      setStatus({ enabled: true, enabledAt: new Date().toISOString(), recoveryCodesLeft: result.recoveryCodes.length, method: setup.method });
      setSetup(null);
      setCode("");
    });
  const sendCode = () =>
    run(async () => {
      const result = await call({ action: "send-code" });
      setInfo(`${result.email} adresine yeni kod gönderildi.`);
    });
  const disable = () =>
    run(async () => {
      await call({ action: "disable", password, code });
      setStatus({ enabled: false, enabledAt: null, recoveryCodesLeft: 0, method: null });
      setMode("idle");
      setCode("");
      setPassword("");
      setCodes(null);
    });
  const regenerate = () =>
    run(async () => {
      const result = await call({ action: "recovery", code });
      setCodes(result.recoveryCodes);
      setStatus((s) => ({ ...s, recoveryCodesLeft: result.recoveryCodes.length }));
      setMode("idle");
      setCode("");
    });

  const enabledText =
    status.method === "EMAIL"
      ? `Girişte ${email} adresine gelen kod isteniyor.`
      : "Girişte doğrulama uygulamasındaki kod isteniyor.";

  return (
    <div className="mt-3 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-3">
        {status.enabled ? (
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-600" aria-hidden />
        ) : (
          <ShieldOff className="mt-0.5 h-5 w-5 shrink-0 text-neutral-400" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-neutral-900">
            {status.enabled ? `Açık · ${status.method === "EMAIL" ? "e-postayla kod" : "doğrulama uygulaması"}` : "Kapalı"}
          </p>
          <p className="mt-0.5 text-sm text-neutral-600">
            {status.enabled
              ? `${enabledText} Kalan kurtarma kodu: ${status.recoveryCodesLeft}.`
              : "Girişte şifreye ek olarak 6 haneli bir kod istenir."}
          </p>
        </div>
      </div>

      {codes && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-700">Kurtarma kodların (yalnızca şimdi gösteriliyor)</p>
          <p className="mt-1 text-xs text-amber-700">Kodu alamadığında girişte kullanılır; her biri bir kez geçer. Bir yere kaydet.</p>
          <ul className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm text-neutral-900 sm:grid-cols-4">
            {codes.map((c) => (
              <li key={c} className="rounded bg-white px-2 py-1 text-center">
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!status.enabled && !setup && (
        <div className="mt-4 space-y-2">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => startSetup("EMAIL")} disabled={busy || !emailAvailable} className={`${primary} inline-flex items-center gap-2`}>
              <Mail className="h-4 w-4" aria-hidden />
              E-postayla aç
            </button>
            <button type="button" onClick={() => startSetup("APP")} disabled={busy} className={`${secondary} inline-flex items-center gap-2`}>
              <Smartphone className="h-4 w-4" aria-hidden />
              Doğrulama uygulamasıyla aç
            </button>
          </div>
          {!emailAvailable && (
            <p className="text-xs text-neutral-500">E-posta gönderimi kurulunca açılabilir.</p>
          )}
        </div>
      )}

      {setup?.method === "EMAIL" && (
        <div className="mt-4 space-y-3 text-sm">
          <p className="text-neutral-700">
            <span className="font-medium">{setup.email}</span> adresine 6 haneli bir kod gönderdik.
          </p>
          {emailDevMode && <p className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">{DEV_NOTE}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} placeholder="123456" aria-label="Doğrulama kodu" className={`${input} max-w-36 font-mono`} />
            <button type="button" onClick={confirm} disabled={busy || code.length < 6} className={primary}>
              Doğrula ve aç
            </button>
            <button type="button" onClick={() => startSetup("EMAIL")} disabled={busy} className={link}>
              Kodu yeniden gönder
            </button>
            <button type="button" onClick={() => setSetup(null)} className={link}>
              Vazgeç
            </button>
          </div>
        </div>
      )}

      {setup?.method === "APP" && (
        <div className="mt-4 grid gap-4 sm:grid-cols-[auto_1fr]">
          {/* eslint-disable-next-line @next/next/no-img-element -- sunucuda üretilen QR (data: adresi) */}
          <img src={setup.qrDataUrl} alt="Doğrulama uygulaması için QR kod" width={180} height={180} className="rounded-lg border border-neutral-200 bg-white p-2" />
          <div className="space-y-3 text-sm">
            <ol className="list-decimal space-y-1 pl-5 text-neutral-700">
              <li>Doğrulama uygulamasıyla (Google Authenticator vb.) QR kodu tara.</li>
              <li>Uygulamadaki 6 haneli kodu yaz.</li>
            </ol>
            <p className="break-all rounded bg-neutral-100 px-2 py-1 font-mono text-xs text-neutral-700">{setup.secret}</p>
            <div className="flex flex-wrap items-center gap-2">
              <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} placeholder="123456" aria-label="Doğrulama kodu" className={`${input} max-w-36 font-mono`} />
              <button type="button" onClick={confirm} disabled={busy || code.length < 6} className={primary}>
                Doğrula ve aç
              </button>
              <button type="button" onClick={() => setSetup(null)} className={link}>
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      )}

      {status.enabled && mode === "idle" && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => setMode("recovery")} className={secondary}>
            Yeni kurtarma kodları
          </button>
          <button type="button" onClick={() => setMode("disable")} className={`${secondary} text-red-700`}>
            Kapat
          </button>
        </div>
      )}

      {status.enabled && mode !== "idle" && (
        <div className="mt-4 space-y-3">
          {status.method === "EMAIL" && (
            <div className="space-y-2">
              <button type="button" onClick={sendCode} disabled={busy} className={secondary}>
                E-postama kod gönder
              </button>
              {emailDevMode && <p className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">{DEV_NOTE}</p>}
            </div>
          )}
          {mode === "disable" && (
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Şifren" aria-label="Şifren" autoComplete="current-password" className={input} />
          )}
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={status.method === "EMAIL" ? "E-postadaki kod ya da kurtarma kodu" : "Doğrulama kodu ya da kurtarma kodu"} aria-label="Doğrulama kodu" className={`${input} font-mono`} />
          <div className="flex gap-2">
            <button type="button" onClick={mode === "disable" ? disable : regenerate} disabled={busy || code.length < 6} className={primary}>
              {mode === "disable" ? "2FA'yı kapat" : "Kodları yenile"}
            </button>
            <button type="button" onClick={() => setMode("idle")} className={secondary}>
              Vazgeç
            </button>
          </div>
        </div>
      )}

      {info && <p className="mt-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{info}</p>}
      {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
