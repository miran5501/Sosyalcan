import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv";
import { transactionsToCsv } from "./finance-export";

describe("csvCell", () => {
  it("düz metni olduğu gibi bırakır", () => {
    expect(csvCell("Kira")).toBe("Kira");
    expect(csvCell("Yazılım / Abonelik")).toBe("Yazılım / Abonelik");
  });

  it("ayraç, tırnak ve satır sonu içeren hücreyi tırnaklar; tırnağı ikiye katlar", () => {
    expect(csvCell("a;b")).toBe('"a;b"');
    expect(csvCell('o "güzel" gün')).toBe('"o ""güzel"" gün"');
    expect(csvCell("satır1\nsatır2")).toBe('"satır1\nsatır2"');
  });

  it("baştaki/sondaki boşluğu korumak için tırnaklar; null ve undefined boş olur", () => {
    expect(csvCell(" boşluklu ")).toBe('" boşluklu "');
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("formül gibi başlayan hücrelerin başına ' koyar (CSV enjeksiyonu)", () => {
    expect(csvCell("=HYPERLINK(\"http://kotu.com\")")).toBe(`"'=HYPERLINK(""http://kotu.com"")"`);
    expect(csvCell("+1+1")).toBe("'+1+1");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("-2+3")).toBe("'-2+3");
  });

  it("düz sayıları (eksili dahil) formül saymaz", () => {
    expect(csvCell("1250,50")).toBe("1250,50");
    expect(csvCell("-30,00")).toBe("-30,00");
    expect(csvCell("-30")).toBe("-30");
  });
});

describe("toCsv", () => {
  it("UTF-8 BOM ile başlar, ayraç ; satır sonu CRLF", () => {
    const csv = toCsv([["a", "b"], ["c", "d"]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe("﻿a;b\r\nc;d\r\n");
  });
});

describe("transactionsToCsv", () => {
  const t = (over: Partial<Parameters<typeof transactionsToCsv>[0][number]> = {}) => ({
    occurredAt: new Date(2026, 8, 5, 12),
    type: "INCOME" as const,
    category: "Ödeme Planı",
    description: "İçerik Paketi — 9/2026",
    amount: 350_000,
    customer: { name: "Mavi Kırtasiye" },
    ...over,
  });

  it("başlık satırı ve Türkçe biçimli satırlar üretir (tarih GG.AA.YYYY, saat SS:DD, tutar ondalık virgüllü)", () => {
    const csv = transactionsToCsv([
      t({ paymentMethod: { label: "Havale" }, invoiceNo: "ABC123", vatRate: 20, vatAmount: 58_333 }),
      t({ type: "EXPENSE", category: "Kira", description: null, customer: null, amount: 125_050, counterparty: "Ev sahibi", occurredAt: new Date(2026, 8, 5, 9, 7) }),
    ]);

    expect(csv.split("\r\n").slice(0, 3)).toEqual([
      "﻿Tarih;Saat;Tür;Kategori;Açıklama;Kime / Kimden;Ödeme Yöntemi;Müşteri;Fatura No;KDV %;KDV (TL);Tutar (TL)",
      "05.09.2026;12:00;Gelir;Ödeme Planı;İçerik Paketi — 9/2026;;Havale;Mavi Kırtasiye;ABC123;20;583,33;3500,00",
      "05.09.2026;09:07;Gider;Kira;;Ev sahibi;;;;;;1250,50",
    ]);
  });

  it("kayıt yoksa yalnızca başlık satırı olur", () => {
    expect(transactionsToCsv([])).toBe("﻿Tarih;Saat;Tür;Kategori;Açıklama;Kime / Kimden;Ödeme Yöntemi;Müşteri;Fatura No;KDV %;KDV (TL);Tutar (TL)\r\n");
  });

  it("kötü niyetli açıklama formül olarak çalışamaz", () => {
    const csv = transactionsToCsv([t({ description: "=1+1" })]);
    expect(csv).toContain(";'=1+1;");
  });
});
