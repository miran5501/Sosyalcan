import { describe, expect, it } from "vitest";
import { isCrossSiteApiMutation, rateLimitKey } from "./request-guard";

const req = (path: string, init: { method?: string; headers?: Record<string, string> } = {}) =>
  new Request(`http://localhost:3000${path}`, { method: init.method ?? "GET", headers: { host: "localhost:3000", ...init.headers } });

describe("isCrossSiteApiMutation (CSRF)", () => {
  it("aynı kaynaktan gelen API POST'u kabul edilir", () => {
    expect(isCrossSiteApiMutation(req("/api/tasks", { method: "POST", headers: { origin: "http://localhost:3000" } }))).toBe(false);
  });

  it("başka siteden gelen API POST'u reddedilir", () => {
    expect(isCrossSiteApiMutation(req("/api/tasks", { method: "POST", headers: { origin: "https://kotu-site.example" } }))).toBe(true);
    expect(isCrossSiteApiMutation(req("/api/tasks/1", { method: "DELETE", headers: { origin: "http://localhost:4000" } }))).toBe(true);
  });

  it("Origin yoksa tarayıcı cross-site diyorsa reddedilir, aksi halde (curl, sunucu) kabul", () => {
    expect(isCrossSiteApiMutation(req("/api/tasks", { method: "POST", headers: { "sec-fetch-site": "cross-site" } }))).toBe(true);
    expect(isCrossSiteApiMutation(req("/api/tasks", { method: "POST" }))).toBe(false);
  });

  it("Bearer token'lı istekler (mobil) muaftır", () => {
    expect(
      isCrossSiteApiMutation(req("/api/tasks", { method: "POST", headers: { origin: "https://x.example", authorization: "Bearer abc" } })),
    ).toBe(false);
  });

  it("GET istekleri ve sayfa yolları kontrol edilmez", () => {
    expect(isCrossSiteApiMutation(req("/api/tasks", { headers: { origin: "https://x.example" } }))).toBe(false);
    expect(isCrossSiteApiMutation(req("/tasks", { method: "POST", headers: { origin: "https://x.example" } }))).toBe(false);
  });

  it("bozuk Origin reddedilir", () => {
    expect(isCrossSiteApiMutation(req("/api/tasks", { method: "POST", headers: { origin: "null" } }))).toBe(true);
  });
});

describe("rateLimitKey", () => {
  it("Bearer token varsa token'ın özetini kullanır (token'ın kendisini değil)", () => {
    const key = rateLimitKey(req("/api/tasks", { headers: { authorization: "Bearer gizli-token" } }));
    expect(key).toMatch(/^c:[0-9a-f]{32}$/);
    expect(key).not.toContain("gizli");
  });

  it("oturum çerezi varsa onu, yoksa IP'yi kullanır", () => {
    const a = rateLimitKey(req("/api/tasks", { headers: { cookie: "theme=dark; authjs.session-token=abc123" } }));
    const b = rateLimitKey(req("/api/tasks", { headers: { cookie: "authjs.session-token=baska" } }));
    expect(a).toMatch(/^c:/);
    expect(a).not.toBe(b);
    expect(rateLimitKey(req("/api/tasks", { headers: { "x-forwarded-for": "9.9.9.9" } }))).toBe("ip:9.9.9.9");
  });
});
