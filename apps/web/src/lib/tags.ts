export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 30;

/**
 * Serbest yazılmış etiketleri ("VIP, restoran ;  Yeni  müşteri") temiz bir listeye çevirir:
 * virgül/noktalı virgül/satır sonu ile ayrılır, fazla boşluklar birleştirilir, küçük harfe
 * çevrilir, boşlar ve tekrarlar atılır. Uzunluk/adet sınırı şemada denetlenir.
 *
 * Küçük harf kuralı bilerek Türkçe DEĞİL: büyük "I" ve "İ" ikisi de "i" olur. Türkçe kuralıyla
 * "VIP" -> "vıp" olurdu ve "vip" ile eşleşmeyip etiketler çoğalırdı. Bedeli: tamamı büyük yazılan
 * "IŞIK" -> "işik" olur; küçük harfle yazılan "ı" ise olduğu gibi kalır.
 */
export function foldCase(text: string): string {
  return text.replace(/İ/g, "i").toLowerCase();
}

export function normalizeTags(input: string | string[]): string[] {
  const parts = Array.isArray(input) ? input : input.split(/[,;\n]/);
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of parts) {
    const tag = foldCase(raw.replace(/\s+/g, " ").trim());
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
}
