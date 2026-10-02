/**
 * Sunucu açılırken bir kez çalışır (Next.js instrumentation). Ortam değişkenleri geçersizse
 * sunucu istek kabul etmeden kapanır: eksik/zayıf AUTH_SECRET ile hiçbir oturum imzalanmasın.
 */
export async function register() {
  // Next.js'in önerdiği kalıp: Node'a özel kod ayrı dosyada, böylece Edge paketine girmez.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}

/**
 * Sunucuda yakalanan beklenmedik hatalar tek satırlık, aranabilir bir kayıt olarak loglanır
 * (yol, yöntem, Next.js'in hata özeti). Kullanıcıya yalnızca genel hata sayfası gösterilir.
 */
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routeType: string },
) {
  const digest = typeof error === "object" && error !== null && "digest" in error ? String(error.digest) : undefined;
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { recordError } = await import("@/lib/error-tracking");
    await recordError({
      source: "server",
      message: error instanceof Error ? error.message : String(error),
      path: request.path,
      digest,
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
  console.error(
    JSON.stringify({
      level: "error",
      time: new Date().toISOString(),
      method: request.method,
      path: request.path,
      routeType: context.routeType,
      digest,
      message: error instanceof Error ? error.message : String(error),
    }),
  );
}
