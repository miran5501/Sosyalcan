/**
 * Tüm para tutarları veritabanında kuruş bazında integer olarak saklanır
 * — yuvarlama hatalarını önlemek için asla float
 * kullanılmaz. Bu dosya TL <-> kuruş dönüşümlerini tek bir yerde toplar.
 */

export function formatKurusAsTL(kurus: number): string {
  return (kurus / 100).toLocaleString("tr-TR", {
    style: "currency",
    currency: "TRY",
  });
}

/**
 * Form girdisindeki TL metnini kuruşa çevirir. Kabul edilen biçimler:
 * "1250", "1250,50", "1.250,50" (Türkçe: nokta binlik, virgül ondalık),
 * "1250.50" (noktadan sonra 1-2 hane = ondalık), "1.250" (3 hane = binlik),
 * baştaki "₺" veya sondaki "TL". Boş metin 0 sayılır. Eksi değer, ikiden
 * fazla ondalık hane veya bozuk gruplama hata verir. Hesap tamamen tamsayı
 * üzerinden yapılır (float yuvarlama hatası yok).
 */
export function parseTLInputToKurus(input: string): number {
  const cleaned = input.replace(/₺|TL|\s/gi, "");
  if (cleaned === "") {
    return 0;
  }

  let integerPart = cleaned;
  let decimalPart = "";
  if (cleaned.includes(",")) {
    const parts = cleaned.split(",");
    if (parts.length !== 2) {
      throw new Error("Geçersiz tutar");
    }
    [integerPart, decimalPart] = parts;
  } else if (/^\d+\.\d{1,2}$/.test(cleaned)) {
    [integerPart, decimalPart] = cleaned.split(".");
  }

  const integerOk = /^(\d+|\d{1,3}(\.\d{3})+)$/.test(integerPart);
  const decimalOk = /^\d{0,2}$/.test(decimalPart);
  if (!integerOk || !decimalOk) {
    throw new Error("Geçersiz tutar");
  }

  const lira = Number(integerPart.replace(/\./g, ""));
  const kurus = Number(decimalPart.padEnd(2, "0"));
  return lira * 100 + kurus;
}

/**
 * Kuruşu forma yazılacak Türkçe tutar metnine çevirir ("350000" -> "3500,00"; binlik ayracı yok).
 * `parseTLInputToKurus` ile gidiş-dönüş tutarlıdır. Tamsayı hesabı: float yuvarlama yok.
 */
export function kurusToTLInput(kurus: number): string {
  const sign = kurus < 0 ? "-" : "";
  const abs = Math.abs(kurus);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}
