import { readSheet } from "read-excel-file/node";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { foldCase } from "@/lib/tags";
import { createCustomerSchema } from "@/lib/validations/customer";

/**
 * Excel (.xlsx) ya da CSV dosyasından toplu müşteri aktarma (ilk kurulumda listeyi elle girmemek için).
 *
 * Akış iki adımlı ve durumsuz: aynı dosya önce "önizleme" için, onaylanınca "kaydet" için gönderilir;
 * sunucu her seferinde baştan okur ve doğrular (istemcinin gönderdiği önizleme sonucuna güvenilmez).
 *
 * İlk satır başlıktır; sütunlar Türkçe/İngilizce adlarından tanınır (sıra önemli değil). Aynı ada sahip
 * müşteri (arşivdekiler dahil, büyük/küçük harf fark etmeksizin) ya da dosyada tekrar eden satır atlanır.
 */
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 1000;

type Field = "name" | "contact" | "notes" | "tags";
const HEADER_ALIASES: Record<Field, string[]> = {
  name: ["ad", "adı", "müşteri", "müşteri adı", "musteri", "musteri adi", "firma", "firma adı", "unvan", "name", "customer"],
  contact: ["iletişim", "iletisim", "telefon", "tel", "e-posta", "eposta", "email", "e-mail", "yetkili", "contact", "phone"],
  notes: ["not", "notlar", "açıklama", "aciklama", "notes", "note"],
  tags: ["etiket", "etiketler", "tags", "tag"],
};

export type ImportRow = {
  line: number;
  name: string;
  contact: string | null;
  notes: string | null;
  tags: string[];
  status: "new" | "duplicate" | "invalid";
  error?: string;
};
export type ImportPreview = { rows: ImportRow[]; counts: { new: number; duplicate: number; invalid: number } };

/** Basit ama doğru CSV okuyucu: tırnaklı alanlar, alan içinde ayırıcı / satır sonu ve "" kaçışı. */
export function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  // Türkçe Excel CSV'yi ";" ile kaydeder; hangisi çoksa o ayırıcıdır.
  const delimiter = [";", ",", "\t"].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === "") {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** CSV'yi metne çevirir: UTF-8 (BOM'lu ya da değil); geçersizse eski Türkçe Windows kodlaması (1254). */
function decodeCsv(buffer: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1254").decode(buffer);
  }
}

async function readRows(buffer: Buffer, fileName: string): Promise<string[][]> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) return parseCsv(decodeCsv(buffer));
  if (lower.endsWith(".xlsx")) {
    try {
      const sheet = await readSheet(buffer);
      return sheet.map((row) => row.map((cell) => (cell === null || cell === undefined ? "" : cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell))));
    } catch {
      throw new ApiError(400, "Excel dosyası okunamadı. Dosyanın bozuk olmadığından emin ol ya da CSV olarak kaydedip dene.");
    }
  }
  throw new ApiError(400, "Yalnızca .xlsx ya da .csv dosyası yüklenebilir (eski .xls biçimini Excel'de .xlsx olarak kaydet).");
}

function mapHeaders(header: string[]): Map<number, Field> {
  const map = new Map<number, Field>();
  header.forEach((cell, index) => {
    const key = foldCase(cell.trim()).replace(/\s+/g, " ");
    for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [Field, string[]][]) {
      if (aliases.some((alias) => foldCase(alias) === key)) map.set(index, field);
    }
  });
  return map;
}

export async function previewCustomerImport(buffer: Buffer, fileName: string): Promise<ImportPreview> {
  if (buffer.length === 0) throw new ApiError(400, "Dosya boş");
  if (buffer.length > IMPORT_MAX_BYTES) throw new ApiError(400, "Dosya en fazla 2 MB olabilir");
  const all = await readRows(buffer, fileName);
  const [header, ...body] = all;
  if (!header) throw new ApiError(400, "Dosya boş");
  const columns = mapHeaders(header);
  if (![...columns.values()].includes("name")) {
    throw new ApiError(400, 'İlk satırda müşteri adı sütunu bulunamadı. Başlık "Ad" ya da "Müşteri" olmalı (şablonu indirip kullanabilirsin).');
  }
  const dataRows = body.map((cells, i) => ({ cells, line: i + 2 })).filter(({ cells }) => cells.some((c) => c.trim() !== ""));
  if (dataRows.length > IMPORT_MAX_ROWS) throw new ApiError(400, `Bir seferde en fazla ${IMPORT_MAX_ROWS} müşteri aktarılabilir`);

  const existing = await prisma.customer.findMany({ select: { name: true } });
  const seen = new Set(existing.map((c) => foldCase(c.name.trim())));
  const rows: ImportRow[] = [];

  for (const { cells, line } of dataRows) {
    const values: Record<Field, string[]> = { name: [], contact: [], notes: [], tags: [] };
    columns.forEach((field, index) => {
      const value = (cells[index] ?? "").trim();
      if (value) values[field].push(value);
    });
    const draft = {
      name: values.name.join(" "),
      contact: values.contact.join(" · ") || undefined,
      notes: values.notes.join("\n") || undefined,
      tags: values.tags.join(","),
    };
    const parsed = createCustomerSchema.safeParse(draft);
    const base = { line, name: draft.name, contact: draft.contact ?? null, notes: draft.notes ?? null };
    if (!parsed.success) {
      rows.push({ ...base, tags: [], status: "invalid", error: parsed.error.issues[0]?.message ?? "Geçersiz satır" });
      continue;
    }
    const key = foldCase(parsed.data.name.trim());
    const status = seen.has(key) ? "duplicate" : "new";
    seen.add(key);
    rows.push({ ...base, name: parsed.data.name.trim(), tags: parsed.data.tags ?? [], status });
  }

  const count = (status: ImportRow["status"]) => rows.filter((r) => r.status === status).length;
  return { rows, counts: { new: count("new"), duplicate: count("duplicate"), invalid: count("invalid") } };
}

/** Önizlemedeki "yeni" satırları tek işlemde kaydeder; mükerrer ve hatalı satırlar atlanır. */
export async function commitCustomerImport(buffer: Buffer, fileName: string) {
  const preview = await previewCustomerImport(buffer, fileName);
  const toCreate = preview.rows.filter((r) => r.status === "new");
  if (toCreate.length > 0) {
    await prisma.customer.createMany({
      data: toCreate.map((r) => ({ name: r.name, contact: r.contact, notes: r.notes, tags: r.tags })),
    });
  }
  return { created: toCreate.length, skipped: preview.counts.duplicate + preview.counts.invalid };
}

/** Doldurulacak şablon: Türkçe Excel'in doğrudan açabildiği UTF-8 (BOM'lu), ";" ayırıcılı CSV. */
export function customerImportTemplate(): string {
  return "﻿" + ["Ad;İletişim;Notlar;Etiketler", "Örnek Kafe;Ayşe Yılmaz · 0532 000 00 00;Aylık 4 reels;restoran, vip"].join("\r\n") + "\r\n";
}
