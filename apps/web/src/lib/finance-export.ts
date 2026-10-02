import { toCsv } from "@/lib/csv";
import { kurusToTLInput } from "@/lib/money";

type ExportTransaction = {
  occurredAt: Date;
  type: "INCOME" | "EXPENSE";
  category: string | null;
  description: string | null;
  counterparty?: string | null;
  amount: number;
  customer: { name: string } | null;
  paymentMethod?: { label: string } | null;
  vatRate?: number | null;
  vatAmount?: number | null;
  invoiceNo?: string | null;
};

const pad = (n: number) => String(n).padStart(2, "0");
const formatDate = (d: Date) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
const formatTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Finans kayıtlarını Excel'de açılacak CSV metnine çevirir. Tutar her zaman pozitif, yönü "Tür" sütunu söyler. */
export function transactionsToCsv(transactions: ExportTransaction[]): string {
  return toCsv([
    ["Tarih", "Saat", "Tür", "Kategori", "Açıklama", "Kime / Kimden", "Ödeme Yöntemi", "Müşteri", "Fatura No", "KDV %", "KDV (TL)", "Tutar (TL)"],
    ...transactions.map((t) => [
      formatDate(t.occurredAt),
      formatTime(t.occurredAt),
      t.type === "INCOME" ? "Gelir" : "Gider",
      t.category,
      t.description,
      t.counterparty,
      t.paymentMethod?.label,
      t.customer?.name,
      t.invoiceNo,
      t.vatRate !== null && t.vatRate !== undefined ? String(t.vatRate) : "",
      t.vatAmount !== null && t.vatAmount !== undefined ? kurusToTLInput(t.vatAmount) : "",
      kurusToTLInput(t.amount),
    ]),
  ]);
}
