/**
 * Excel'de açılan CSV üretimi (Türkçe Excel uyumlu): ayraç `;`, UTF-8 BOM (Türkçe karakterler
 * bozulmasın), satır sonu CRLF. Tutarlar Türkçe ondalık virgülüyle ("1250,50") yazılır.
 */
const DELIMITER = ";";
const NUMBER_LIKE = /^-?\d+(,\d+)?$/;

/**
 * Hücre değeri `=`, `+`, `-`, `@` veya sekme/satırbaşı ile başlıyorsa Excel onu formül olarak
 * çalıştırabilir (CSV enjeksiyonu: "=HYPERLINK(...)" gibi). Başına `'` konarak metne çevrilir.
 * Düz sayılar ("-30,00") formül değildir, olduğu gibi kalır.
 */
function guardFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) && !NUMBER_LIKE.test(value) ? `'${value}` : value;
}

export function csvCell(value: string | null | undefined): string {
  const text = guardFormula(value ?? "");
  return /[;"\r\n]|^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: (string | null | undefined)[][]): string {
  return "﻿" + rows.map((row) => row.map(csvCell).join(DELIMITER)).join("\r\n") + "\r\n";
}
